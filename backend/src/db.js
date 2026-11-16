import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'delivro.db'));
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
  created_at  TEXT NOT NULL,
  UNIQUE (provider, provider_id)
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
`);

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
    category: row.category,
    imageUrl: row.image_url ?? '',
    available: !!row.available,
    createdAt: row.created_at,
  };
}
