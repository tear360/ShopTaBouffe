import { Router } from 'express';
import { db, nowIso } from '../db.js';
import { requireAuth, requireSupplier } from '../auth.js';
import { getIO } from '../sockets.js';

const router = Router();

function emitChanged() {
  getIO()?.emit('categories:changed');
}

function toCategory(row) {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

function findCategory(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(n);
}

/** GET /api/categories — public (chips de la galerie) */
router.get('/', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category = c.name) AS products_count
       FROM categories c ORDER BY c.name COLLATE NOCASE`
    )
    .all();
  res.json({
    categories: rows.map((r) => ({ ...toCategory(r), productsCount: r.products_count })),
  });
});

/** POST /api/categories { name } (supplier) → 201 */
router.post('/', requireAuth, requireSupplier, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 1 || name.length > 60) {
    return res.status(400).json({ error: 'name: 1 à 60 caractères' });
  }
  if (db.prepare('SELECT id FROM categories WHERE name = ?').get(name)) {
    return res.status(409).json({ error: 'Catégorie déjà existante' });
  }
  const info = db
    .prepare('INSERT INTO categories (name, created_at) VALUES (?, ?)')
    .run(name, nowIso());
  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid);
  emitChanged();
  return res.status(201).json(toCategory(row));
});

/** PATCH /api/categories/:id { name } (supplier) — renomme aussi les produits liés */
router.patch('/:id', requireAuth, requireSupplier, (req, res) => {
  const existing = findCategory(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Catégorie introuvable' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 1 || name.length > 60) {
    return res.status(400).json({ error: 'name: 1 à 60 caractères' });
  }
  if (name === existing.name) return res.json(toCategory(existing));
  const clash = db.prepare('SELECT id FROM categories WHERE name = ? AND id != ?').get(name, existing.id);
  if (clash) return res.status(409).json({ error: 'Catégorie déjà existante' });
  db.transaction(() => {
    db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, existing.id);
    // Les produits portent le nom en texte : on les suit pour ne pas casser les filtres.
    db.prepare('UPDATE products SET category = ? WHERE category = ?').run(name, existing.name);
  })();
  emitChanged();
  return res.json(toCategory(db.prepare('SELECT * FROM categories WHERE id = ?').get(existing.id)));
});

/** DELETE /api/categories/:id (supplier) → 204 ; 409 si encore utilisée */
router.delete('/:id', requireAuth, requireSupplier, (req, res) => {
  const existing = findCategory(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Catégorie introuvable' });
  const used = db.prepare('SELECT COUNT(*) AS n FROM products WHERE category = ?').get(existing.name);
  if (used.n > 0) {
    return res.status(409).json({ error: `Catégorie utilisée par ${used.n} produit(s)` });
  }
  db.prepare('DELETE FROM categories WHERE id = ?').run(existing.id);
  emitChanged();
  return res.status(204).end();
});

export default router;
