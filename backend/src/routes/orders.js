import { Router } from 'express';
import { db, nowIso } from '../db.js';
import { requireAuth, requireSupplier } from '../auth.js';
import { getIO } from '../sockets.js';

const router = Router();

// Transitions strictes (§4) : pending → accepted|refused ; accepted → preparing → delivering → delivered
const TRANSITIONS = {
  pending: ['accepted', 'refused'],
  accepted: ['preparing'],
  preparing: ['delivering'],
  delivering: ['delivered'],
  refused: [],
  delivered: [],
};

function findOrder(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(n);
}

/** Objet Order. includeCustomer=true uniquement pour les réponses supplier. */
function buildOrder(row, includeCustomer) {
  const items = db
    .prepare('SELECT product_id, name, price_cents, qty FROM order_items WHERE order_id = ? ORDER BY id')
    .all(row.id)
    .map((i) => ({ productId: i.product_id, name: i.name, priceCents: i.price_cents, qty: i.qty }));
  const out = {
    id: row.id,
    status: row.status,
    totalCents: row.total_cents,
    address: row.address,
    phone: row.phone,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items,
  };
  if (includeCustomer) {
    const c = db.prepare('SELECT id, name, avatar_url FROM users WHERE id = ?').get(row.user_id);
    out.customer = c ? { id: c.id, name: c.name, avatarUrl: c.avatar_url ?? null } : null;
  }
  return out;
}

/**
 * Journalise une vente à la livraison (espace Finances).
 * Copie figée : survit à la purge de 2 h de la commande.
 */
function recordSale(order) {
  if (db.prepare('SELECT id FROM sales WHERE order_id = ?').get(order.id)) return;
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  const ts = nowIso();
  db.transaction(() => {
    const sale = db
      .prepare('INSERT INTO sales (order_id, total_cents, delivered_at) VALUES (?, ?, ?)')
      .run(order.id, order.total_cents, ts);
    const insertItem = db.prepare(
      'INSERT INTO sale_items (sale_id, product_id, name, price_cents, cost_cents, qty) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const it of items) {
      const product = it.product_id
        ? db.prepare('SELECT cost_cents FROM products WHERE id = ?').get(it.product_id)
        : null;
      insertItem.run(
        sale.lastInsertRowid,
        it.product_id,
        it.name,
        it.price_cents,
        product?.cost_cents ?? 0,
        it.qty
      );
    }
  })();
}

/** POST /api/orders */
router.post('/', requireAuth, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const errors = [];
  const items = body.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
    errors.push('items: 1 à 50 lignes');
  }
  const address = typeof body.address === 'string' ? body.address.trim() : '';
  if (address.length < 3 || address.length > 200) errors.push('address: 3 à 200 caractères');
  // Le numéro enregistré dans le compte sert de valeur par défaut : le client
  // peut le pré-remplir, mais un envoi sans champ reste valide.
  const phoneRaw = typeof body.phone === 'string' ? body.phone.trim() : '';
  const phone = phoneRaw || (req.user.phone ? String(req.user.phone).trim() : '');
  if (phone.length < 6 || phone.length > 30) errors.push('phone: 6 à 30 caractères');
  const note = body.note == null ? '' : body.note;
  if (typeof note !== 'string' || note.length > 500) errors.push('note: 500 caractères max');

  const lines = [];
  if (Array.isArray(items)) {
    items.forEach((item, i) => {
      const productId = item ? item.productId : undefined;
      const qty = item ? item.qty : undefined;
      if (!Number.isInteger(productId) || productId <= 0) errors.push(`items[${i}].productId invalide`);
      else if (!Number.isInteger(qty) || qty < 1 || qty > 99) errors.push(`items[${i}].qty: 1 à 99`);
      else lines.push({ productId, qty });
    });
  }
  if (errors.length) return res.status(400).json({ error: `Requête invalide: ${errors.join(', ')}` });

  // Re-validation prix + disponibilité côté serveur
  const detailed = [];
  for (const line of lines) {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(line.productId);
    if (!product) return res.status(400).json({ error: `Produit introuvable: ${line.productId}` });
    if (!product.available) return res.status(400).json({ error: `Produit indisponible: ${product.name}` });
    detailed.push({ ...line, name: product.name, priceCents: product.price_cents });
  }
  const total = detailed.reduce((sum, l) => sum + l.priceCents * l.qty, 0);
  const ts = nowIso();

  const orderId = db.transaction(() => {
    const info = db
      .prepare(
        "INSERT INTO orders (user_id, status, total_cents, address, phone, note, created_at, updated_at) VALUES (?, 'pending', ?, ?, ?, ?, ?, ?)"
      )
      .run(req.user.id, total, address, phone, note, ts, ts);
    const insertItem = db.prepare(
      'INSERT INTO order_items (order_id, product_id, name, price_cents, qty) VALUES (?, ?, ?, ?, ?)'
    );
    for (const l of detailed) insertItem.run(info.lastInsertRowid, l.productId, l.name, l.priceCents, l.qty);
    return info.lastInsertRowid;
  })();

  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  const io = getIO();
  io?.to('admin').emit('order:new', buildOrder(row, true));
  // `mine: true` : le client ne notifie que SES commandes (l'admin reçoit aussi ce salon).
  io?.to(`user:${row.user_id}`).emit('order:updated', { ...buildOrder(row, false), mine: true });
  // l'exemple 201 du §4 inclut customer
  return res.status(201).json(buildOrder(row, true));
});

/** GET /api/orders/mine */
router.get('/mine', requireAuth, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC, id DESC')
    .all(req.user.id);
  res.json({ orders: rows.map((r) => buildOrder(r, false)) });
});

/** GET /api/orders?status= (supplier) */
router.get('/', requireAuth, requireSupplier, (req, res) => {
  const params = [];
  let sql = 'SELECT * FROM orders';
  if (req.query.status) {
    sql += ' WHERE status = ?';
    params.push(String(req.query.status));
  }
  sql += ' ORDER BY created_at DESC, id DESC';
  res.json({ orders: db.prepare(sql).all(...params).map((r) => buildOrder(r, true)) });
});

/** GET /api/orders/:id (propriétaire ou supplier) */
router.get('/:id', requireAuth, (req, res) => {
  const row = findOrder(req.params.id);
  if (!row) return res.status(404).json({ error: 'Commande introuvable' });
  const isSupplier = req.user.role === 'supplier';
  if (row.user_id !== req.user.id && !isSupplier) {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  return res.json(buildOrder(row, isSupplier));
});

/** PATCH /api/orders/:id { status } (supplier) — transitions strictes */
router.patch('/:id', requireAuth, requireSupplier, (req, res) => {
  const row = findOrder(req.params.id);
  if (!row) return res.status(404).json({ error: 'Commande introuvable' });
  const status = req.body ? req.body.status : undefined;
  if (typeof status !== 'string') return res.status(400).json({ error: 'Champ status requis' });
  const allowed = TRANSITIONS[row.status] || [];
  if (!allowed.includes(status)) {
    return res.status(409).json({ error: `Transition invalide: ${row.status} → ${status}` });
  }
  db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), row.id);
  if (status === 'delivered') recordSale(row);
  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(row.id);
  const io = getIO();
  io?.to(`user:${updated.user_id}`).emit('order:updated', { ...buildOrder(updated, false), mine: true });
  io?.to('admin').emit('order:updated', buildOrder(updated, true));
  return res.json(buildOrder(updated, true));
});

export default router;
