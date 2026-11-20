import { Router } from 'express';
import { db, toProduct, nowIso } from '../db.js';
import { requireAuth, requireSupplier } from '../auth.js';
import { getIO } from '../sockets.js';

const router = Router();

function emit(action, formule) {
  // Une formule est un produit : le même événement rafraîchit toutes les vues.
  getIO()?.emit('product:changed', { action, product: formule });
}

function findFormule(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  return db.prepare("SELECT * FROM products WHERE id = ? AND kind = 'formule'").get(n) || null;
}

/**
 * Validation d'une formule. `items` = [{ productId, qty }], 1 à 30 produits,
 * quantité 1..99. Les doublons sont additionnés. Les formules ne peuvent pas
 * contenir d'autres formules.
 */
function validateFields(body, partial) {
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  const fields = {};
  const errors = [];

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
    if (typeof imageUrl !== 'string' || imageUrl.length > 500) {
      errors.push('imageUrl: 500 caractères max');
    } else fields.imageUrl = imageUrl;
  }
  if (!partial || has('available')) {
    const available = partial ? body.available : body.available == null ? true : body.available;
    if (typeof available !== 'boolean') errors.push('available: booléen');
    else fields.available = available;
  }
  if (!partial || has('items')) {
    const items = has('items') ? body.items : [];
    if (!Array.isArray(items) || items.length < 1 || items.length > 30) {
      errors.push('items: 1 à 30 produits requis');
    } else {
      const merged = new Map();
      for (const item of items) {
        const productId = Number(item && item.productId);
        const qty = Number(item && item.qty);
        if (
          !Number.isInteger(productId) || productId <= 0 ||
          !Number.isInteger(qty) || qty < 1 || qty > 99
        ) {
          errors.push('items: productId et qty doivent être des entiers valides');
          break;
        }
        const found = db
          .prepare("SELECT id FROM products WHERE id = ? AND kind != 'formule'")
          .get(productId);
        if (!found) {
          errors.push(`items: le produit ${productId} est introuvable`);
          break;
        }
        merged.set(productId, (merged.get(productId) || 0) + qty);
      }
      if (!errors.length) {
        fields.items = [...merged].map(([productId, qty]) => ({ productId, qty }));
      }
    }
  }
  return { ok: errors.length === 0, fields, errors };
}

/** Coût de revient de la formule = somme des coûts des produits composants. */
function costOf(items) {
  let cost = 0;
  for (const item of items) {
    const row = db.prepare('SELECT cost_cents FROM products WHERE id = ?').get(item.productId);
    cost += (row ? row.cost_cents : 0) * item.qty;
  }
  return cost;
}

function writeItems(formuleId, items) {
  db.prepare('DELETE FROM formule_items WHERE formule_id = ?').run(formuleId);
  const insert = db.prepare(
    'INSERT INTO formule_items (formule_id, product_id, qty) VALUES (?, ?, ?)'
  );
  for (const item of items) insert.run(formuleId, item.productId, item.qty);
}

/** GET /api/formules — liste des formules (mêmes filtres que /products). */
router.get('/', (req, res) => {
  const clauses = ["kind = 'formule'"];
  const params = [];
  if (req.query.search) {
    const like = `%${String(req.query.search).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    clauses.push("(name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')");
    params.push(like, like);
  }
  if (req.query.category) {
    clauses.push('category = ?');
    params.push(String(req.query.category));
  }
  if (req.query.available === '1') clauses.push('available = 1');
  else if (req.query.available === '0') clauses.push('available = 0');
  const rows = db
    .prepare(`SELECT * FROM products WHERE ${clauses.join(' AND ')} ORDER BY category, name`)
    .all(...params);
  return res.json({ formules: rows.map(toProduct) });
});

/** GET /api/formules/:id */
router.get('/:id', (req, res) => {
  const formule = findFormule(req.params.id);
  if (!formule) return res.status(404).json({ error: 'Formule introuvable' });
  return res.json(toProduct(formule));
});

/** POST /api/formules (fournisseur) → 201 */
router.post('/', requireAuth, requireSupplier, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const { ok, fields, errors } = validateFields(body, false);
  if (!ok) return res.status(400).json({ error: `Champs invalides: ${errors.join(', ')}` });

  const id = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO products
           (name, description, price_cents, cost_cents, category, image_url, available, created_at, kind)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'formule')`
      )
      .run(
        fields.name,
        fields.description,
        fields.priceCents,
        costOf(fields.items),
        fields.category,
        fields.imageUrl,
        fields.available ? 1 : 0,
        nowIso()
      );
    const newId = Number(info.lastInsertRowid);
    writeItems(newId, fields.items);
    return newId;
  })();

  const formule = toProduct(findFormule(id));
  emit('created', formule);
  return res.status(201).json(formule);
});

/** PATCH /api/formules/:id (fournisseur) */
router.patch('/:id', requireAuth, requireSupplier, (req, res) => {
  const existing = findFormule(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Formule introuvable' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const { ok, fields, errors } = validateFields(body, true);
  if (!ok) return res.status(400).json({ error: `Champs invalides: ${errors.join(', ')}` });

  const columnFor = {
    name: 'name',
    priceCents: 'price_cents',
    category: 'category',
    description: 'description',
    imageUrl: 'image_url',
    available: 'available',
  };
  const keys = Object.keys(fields).filter((k) => k !== 'items');
  if (keys.length === 0 && !fields.items) {
    return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
  }

  db.transaction(() => {
    if (keys.length) {
      const sets = keys.map((k) => `${columnFor[k]} = ?`);
      const values = keys.map((k) => (k === 'available' ? (fields.available ? 1 : 0) : fields[k]));
      db.prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`).run(...values, existing.id);
    }
    if (fields.items) {
      writeItems(existing.id, fields.items);
      db.prepare('UPDATE products SET cost_cents = ? WHERE id = ?')
        .run(costOf(fields.items), existing.id);
    }
  })();

  const formule = toProduct(findFormule(existing.id));
  emit('updated', formule);
  return res.json(formule);
});

/** DELETE /api/formules/:id (fournisseur) → 204 */
router.delete('/:id', requireAuth, requireSupplier, (req, res) => {
  const existing = findFormule(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Formule introuvable' });
  db.prepare('DELETE FROM products WHERE id = ?').run(existing.id);
  emit('deleted', toProduct(existing));
  return res.status(204).end();
});

export default router;
