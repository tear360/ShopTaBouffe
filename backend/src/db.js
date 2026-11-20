import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'delivro.db'));

// Migration : colonne password_hash (comptes par mot de passe)
try { db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT'); } catch { /* déjà présente */ }
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- migrations / création des tables (au démarrage) ---
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  provider    TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  email       TEXT,
  avatar_url  TEXT,
  role        TEXT NOT NULL DEFAULT 'customer',
  password_hash TEXT,
  created_at  TEXT NOT NULL,
  UNIQUE (provider, provider_id)
);

CREATE TABLE IF NOT EXISTS supplier_sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_codes (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  code   TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL,
  category    TEXT NOT NULL,
  image_url   TEXT NOT NULL DEFAULT '',
  available   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  status      TEXT NOT NULL DEFAULT 'pending',
  total_cents INTEGER NOT NULL,
  address     TEXT NOT NULL,
  phone       TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER,
  name       TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  qty        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES users(id),
  supplier_id INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (customer_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       INTEGER NOT NULL REFERENCES users(id),
  body            TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  read_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, id);

-- Espace Finances (fournisseur) --------------------------------------------
-- Journal des ventes : écrit à la livraison, SURVIT à la purge de 2 h des commandes.
CREATE TABLE IF NOT EXISTS sales (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL,
  total_cents  INTEGER NOT NULL,
  delivered_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sale_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id     INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id  INTEGER,
  name        TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  cost_cents  INTEGER NOT NULL DEFAULT 0,
  qty         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);

-- Une seule ligne de vente par commande (transition delivered unique).
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_order ON sales(order_id);

-- Dépenses manuelles du fournisseur (charges, achats divers…)
CREATE TABLE IF NOT EXISTS expenses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  label        TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  date         TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
`);

// Migration : prix de revient sur les produits (coût d'achat → marge).
const productCols = db.prepare('PRAGMA table_info(products)').all();
if (!productCols.some((c) => c.name === 'cost_cents')) {
  db.exec('ALTER TABLE products ADD COLUMN cost_cents INTEGER NOT NULL DEFAULT 0');
}

// Seed des catégories (une seule fois, pas au redémarrage après suppression).
if (!db.prepare("SELECT value FROM settings WHERE key = 'categories_seeded'").get()) {
  const insertCat = db.prepare('INSERT OR IGNORE INTO categories (name, created_at) VALUES (?, ?)');
  const ts = new Date().toISOString();
  for (const name of [
    'Pizza', 'Burger', 'Sushi', 'Dessert', 'Boisson',
    'Sandwich', 'Salade', 'Snack', 'Plat', 'Épicerie',
  ]) insertCat.run(name, ts);
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('categories_seeded', '1')").run();
}

/** Prépare le secret JWT persisté (au 1er lancement, si JWT_SECRET absent). */
export function ensureReady() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'jwt_secret'").get();
  if (!row) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('jwt_secret', ?)").run(
      crypto.randomBytes(32).toString('hex')
    );
  }
}

export function nowIso() {
  return new Date().toISOString();
}

/** Ligne users → objet User (camelCase, dates ISO). */
export function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    email: row.email ?? null,
    avatarUrl: row.avatar_url ?? null,
    role: row.role,
    createdAt: row.created_at,
  };
}

/** Ligne products → objet Product. */
export function toProduct(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    priceCents: row.price_cents,
    costCents: row.cost_cents ?? 0,
    category: row.category,
    imageUrl: row.image_url ?? '',
    available: !!row.available,
    createdAt: row.created_at,
  };
}
