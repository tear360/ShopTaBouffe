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
  phone       TEXT,
  avatar_url  TEXT,
  role        TEXT NOT NULL DEFAULT 'customer',
  password_hash TEXT,
  created_at  TEXT NOT NULL,
  UNIQUE (provider, provider_id)
);

-- Un compte peut avoir plusieurs identités (mot de passe, GitHub, Google).
-- La table users garde l'identité "principale" historique pour les token/roles.
CREATE TABLE IF NOT EXISTS user_identities (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  email       TEXT,
  avatar_url  TEXT,
  created_at  TEXT NOT NULL,
  UNIQUE (provider, provider_id)
);
CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities(user_id);

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

-- Une formule est un produit de type "formule" : elle garde un id, un prix,
-- une image et une catégorie, donc elle passe dans le panier, les commandes,
-- les finances et les catégories sans logique parallèle.
CREATE TABLE IF NOT EXISTS formule_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  formule_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty         INTEGER NOT NULL,
  UNIQUE (formule_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_formule_items_formule ON formule_items(formule_id);

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

// Migration : téléphone sur les comptes existants (créé directement dans le CREATE ci-dessus).
const userCols = db.prepare('PRAGMA table_info(users)').all();
if (!userCols.some((c) => c.name === 'phone')) {
  db.exec('ALTER TABLE users ADD COLUMN phone TEXT');
}

// Migration : sécurité du compte (2FA, révocation des tokens, réinitialisation).
for (const [name, ddl] of [
  ['totp_secret', 'TEXT'],
  ['totp_enabled', 'INTEGER NOT NULL DEFAULT 0'],
  ['totp_pending_secret', 'TEXT'],
  ['token_version', 'INTEGER NOT NULL DEFAULT 0'],
]) {
  if (!userCols.some((c) => c.name === name)) {
    db.exec(`ALTER TABLE users ADD COLUMN ${name} ${ddl}`);
  }
}

// Codes de récupération 2FA (hashés) et jetons de réinitialisation (hashés).
db.exec(`
CREATE TABLE IF NOT EXISTS recovery_codes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recovery_codes_user ON recovery_codes(user_id);

CREATE TABLE IF NOT EXISTS password_resets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_password_resets_hash ON password_resets(token_hash);

-- Codes à 6 chiffres pour vérifier une adresse e-mail ajoutée au compte.
-- Le code est stocké hashé avec un sel propre à chaque demande.
CREATE TABLE IF NOT EXISTS email_verifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  salt        TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_verifications_user ON email_verifications(user_id);
`);

// Les comptes existants ont leur identité dans `users` : on la duplique dans
// `user_identities` pour que liaison / dissociation fonctionne aussi pour eux.
db.prepare(
  `INSERT OR IGNORE INTO user_identities
     (user_id, provider, provider_id, email, avatar_url, created_at)
   SELECT id, provider, provider_id, email, avatar_url, created_at FROM users`
).run();

// Migration : prix de revient sur les produits (coût d'achat → marge).
const productCols = db.prepare('PRAGMA table_info(products)').all();
if (!productCols.some((c) => c.name === 'cost_cents')) {
  db.exec('ALTER TABLE products ADD COLUMN cost_cents INTEGER NOT NULL DEFAULT 0');
}
// Type de produit : 'product' (défaut) ou 'formule' (assemblage de produits).
if (!productCols.some((c) => c.name === 'kind')) {
  db.exec("ALTER TABLE products ADD COLUMN kind TEXT NOT NULL DEFAULT 'product'");
}
// Remise temporaire : prix proposé et date d'expiration (ISO). NULL = pas de remise.
if (!productCols.some((c) => c.name === 'discount_price_cents')) {
  db.exec('ALTER TABLE products ADD COLUMN discount_price_cents INTEGER');
}
if (!productCols.some((c) => c.name === 'discount_until')) {
  db.exec('ALTER TABLE products ADD COLUMN discount_until TEXT');
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
    phone: row.phone ?? null,
    avatarUrl: row.avatar_url ?? null,
    role: row.role,
    createdAt: row.created_at,
  };
}

/** Composition d'une formule : [{ productId, qty, name }]. */
export function formuleItems(formuleId) {
  return db
    .prepare(
      `SELECT fi.product_id, fi.qty, p.name
       FROM formule_items fi JOIN products p ON p.id = fi.product_id
       WHERE fi.formule_id = ? ORDER BY p.name`
    )
    .all(formuleId)
    .map((r) => ({ productId: r.product_id, qty: r.qty, name: r.name }));
}

/**
 * Remise active sur un produit/formule, ou null si absente ou expirée.
 * Le prix normal reste intact en base : l'expiration est donc automatique.
 */
export function activeDiscount(row) {
  if (!row || row.discount_price_cents == null || !row.discount_until) return null;
  const until = Date.parse(row.discount_until);
  if (!Number.isFinite(until) || until <= Date.now()) return null;
  return { priceCents: row.discount_price_cents, until: row.discount_until };
}

/** Prix réellement payé : prix remisé si la remise est encore valable. */
export function effectivePriceCents(row) {
  return activeDiscount(row)?.priceCents ?? row.price_cents;
}

/** Annule une remise devenue plus chère que le nouveau prix normal. */
export function pruneDiscount(id, priceCents) {
  const row = db.prepare('SELECT discount_price_cents FROM products WHERE id = ?').get(id);
  if (row && row.discount_price_cents != null && row.discount_price_cents >= priceCents) {
    db.prepare('UPDATE products SET discount_price_cents = NULL, discount_until = NULL WHERE id = ?').run(id);
  }
}

/** Ligne products → objet Product (avec `kind` et `items` pour les formules). */
export function toProduct(row) {
  if (!row) return null;
  const kind = row.kind === 'formule' ? 'formule' : 'product';
  const discount = activeDiscount(row);
  const out = {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    priceCents: row.price_cents,
    discountPriceCents: discount ? discount.priceCents : null,
    discountUntil: discount ? discount.until : null,
    costCents: row.cost_cents ?? 0,
    category: row.category,
    imageUrl: row.image_url ?? '',
    available: !!row.available,
    createdAt: row.created_at,
    kind,
  };
  if (kind === 'formule') out.items = formuleItems(row.id);
  return out;
}
