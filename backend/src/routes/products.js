import { Router } from 'express';
import { db, toProduct, nowIso } from '../db.js';
import { requireAuth, requireSupplier } from '../auth.js';
import { getIO } from '../sockets.js';

const router = Router();

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function emitProduct(action, product) {
  getIO()?.emit('product:changed', { action, product });
}

/** Valide les champs produits. partial=false → POST (tout requis sauf available/description/imageUrl). */
function validateFields(body, partial) {
  const fields = {};
  const errors = [];
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);

  if (!partial || has('name')) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 1 || name.length > 120) errors.push('name: 1 à 120 caractères');
    else fields.name = name;
  }
  if (!partial || has('priceCents')) {
    const price = body.priceCents;
    if (!Number.isInteger(price) || price < 0) errors.push('priceCents: entier ≥ 0');
    else fields.priceCents = price;
  }
  if (!partial || has('category')) {
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    if (category.length < 1 || category.length > 60) errors.push('category: 1 à 60 caractères');
    else fields.category = category;
  }
  if (!partial || has('description')) {
    const description = body.description == null ? '' : body.description;
    if (typeof description !== 'string' || description.length > 2000) {
      errors.push('description: 2000 caractères max');
    } else fields.description = description;
  }
  if (!partial || has('imageUrl')) {
    const imageUrl = body.imageUrl == null ? '' : body.imageUrl;
    if (typeof imageUrl !== 'string' || imageUrl.length > 500) errors.push('imageUrl: 500 caractères max');
    else fields.imageUrl = imageUrl;
  }
  if (!partial || has('available')) {
    const available = partial ? body.available : body.available == null ? true : body.available;
    if (typeof available !== 'boolean') errors.push('available: booléen');
    else fields.available = available;
  }
  return { ok: errors.length === 0, fields, errors };
}

function findProduct(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  return db.prepare('SELECT * FROM products WHERE id = ?').get(n);
}

/** GET /api/products?search=&category=&available=1 */
router.get('/', (req, res) => {
  const clauses = [];
  const params = [];
  if (req.query.search) {
    const like = `%${escapeLike(String(req.query.search))}%`;
    clauses.push("(name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')");
    params.push(like, like);
  }
  if (req.query.category) {
    clauses.push('category = ?');
    params.push(String(req.query.category));
  }
  if (req.query.available === '1') clauses.push('available = 1');
  else if (req.query.available === '0') clauses.push('available = 0');
  const sql = `SELECT * FROM products${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} ORDER BY category, name`;
  res.json({ products: db.prepare(sql).all(...params).map(toProduct) });
});

/** GET /api/products/:id */
router.get('/:id', (req, res) => {
  const product = findProduct(req.params.id);
  if (!product) return res.status(404).json({ error: 'Produit introuvable' });
  return res.json(toProduct(product));
});

/** POST /api/products (supplier) → 201 */
router.post('/', requireAuth, requireSupplier, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const { ok, fields, errors } = validateFields(body, false);
  if (!ok) return res.status(400).json({ error: `Champs invalides: ${errors.join(', ')}` });
  const info = db
    .prepare(
      'INSERT INTO products (name, description, price_cents, category, image_url, available, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      fields.name,
      fields.description,
      fields.priceCents,
      fields.category,
      fields.imageUrl,
      fields.available ? 1 : 0,
      nowIso()
    );
  const product = toProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid));
  emitProduct('created', product);
  return res.status(201).json(product);
});

/** PATCH /api/products/:id (supplier) */
router.patch('/:id', requireAuth, requireSupplier, (req, res) => {
  const existing = findProduct(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Produit introuvable' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const { ok, fields, errors } = validateFields(body, true);
  if (!ok) return res.status(400).json({ error: `Champs invalides: ${errors.join(', ')}` });
  const keys = Object.keys(fields);
  if (keys.length === 0) return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
  const columnFor = {
    name: 'name',
    priceCents: 'price_cents',
    category: 'category',
    description: 'description',
    imageUrl: 'image_url',
    available: 'available',
  };
  const sets = keys.map((k) => `${columnFor[k]} = ?`);
  const values = keys.map((k) => (k === 'available' ? (fields.available ? 1 : 0) : fields[k]));
  db.prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`).run(...values, existing.id);
  const product = toProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(existing.id));
  emitProduct('updated', product);
  return res.json(product);
});

/** DELETE /api/products/:id (supplier) → 204 */
router.delete('/:id', requireAuth, requireSupplier, (req, res) => {
  const existing = findProduct(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Produit introuvable' });
  db.prepare('DELETE FROM products WHERE id = ?').run(existing.id);
  emitProduct('deleted', toProduct(existing));
  return res.status(204).end();
});

export default router;
