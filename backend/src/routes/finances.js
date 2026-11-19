import { Router } from 'express';
import { db, nowIso } from '../db.js';
import { requireAuth, requireSupplier } from '../auth.js';

const router = Router();
router.use(requireAuth, requireSupplier);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Extrait from/to (AAAA-MM-JJ) ; valide si fourni. */
function readPeriod(req, res) {
  const { from, to } = req.query;
  if (from !== undefined && from !== '' && !DATE_RE.test(String(from))) {
    res.status(400).json({ error: 'from: format AAAA-MM-JJ' });
    return null;
  }
  if (to !== undefined && to !== '' && !DATE_RE.test(String(to))) {
    res.status(400).json({ error: 'to: format AAAA-MM-JJ' });
    return null;
  }
  return { from: from ? String(from) : null, to: to ? String(to) : null };
}

/** Filtre de période sur une colonne ISO (comparaison sur la date locale AAAA-MM-JJ). */
function dateClause(column, period) {
  const clauses = [];
  const params = [];
  if (period.from) {
    clauses.push(`substr(${column}, 1, 10) >= ?`);
    params.push(period.from);
  }
  if (period.to) {
    clauses.push(`substr(${column}, 1, 10) <= ?`);
    params.push(period.to);
  }
  return { where: clauses.length ? ` AND ${clauses.join(' AND ')}` : '', params };
}

/**
 * GET /api/finances/summary?from=&to=
 * Revenus (ventes livrées), coût d'achat, marge brute, dépenses, résultat.
 */
router.get('/summary', (req, res) => {
  const period = readPeriod(req, res);
  if (!period) return;

  const sales = dateClause('s.delivered_at', period);
  const rev = db
    .prepare(
      `SELECT COALESCE(SUM(s.total_cents), 0) AS revenue, COUNT(*) AS orders
       FROM sales s WHERE 1 = 1${sales.where}`
    )
    .get(...sales.params);
  const costs = db
    .prepare(
      `SELECT COALESCE(SUM(si.cost_cents * si.qty), 0) AS cost, COALESCE(SUM(si.qty), 0) AS units
       FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE 1 = 1${sales.where}`
    )
    .get(...sales.params);
  const exp = dateClause('e.date', period);
  const spent = db
    .prepare(
      `SELECT COALESCE(SUM(e.amount_cents), 0) AS total, COUNT(*) AS count
       FROM expenses e WHERE 1 = 1${exp.where}`
    )
    .get(...exp.params);

  const gross = rev.revenue - costs.cost;
  return res.json({
    period,
    revenueCents: rev.revenue,
    costCents: costs.cost,
    grossMarginCents: gross,
    expensesCents: spent.total,
    netCents: gross - spent.total,
    orders: rev.orders,
    units: costs.units,
    expenseCount: spent.count,
  });
});

/** GET /api/finances/sales?from=&to=&limit= — journal des ventes livrées (survit à la purge) */
router.get('/sales', (req, res) => {
  const period = readPeriod(req, res);
  if (!period) return;
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const c = dateClause('delivered_at', period);
  const rows = db
    .prepare(
      `SELECT * FROM sales WHERE 1 = 1${c.where} ORDER BY delivered_at DESC, id DESC LIMIT ?`
    )
    .all(...c.params, limit);
  const itemStmt = db.prepare(
    'SELECT product_id, name, price_cents, cost_cents, qty FROM sale_items WHERE sale_id = ? ORDER BY id'
  );
  return res.json({
    sales: rows.map((s) => ({
      id: s.id,
      orderId: s.order_id,
      totalCents: s.total_cents,
      deliveredAt: s.delivered_at,
      items: itemStmt.all(s.id).map((i) => ({
        productId: i.product_id,
        name: i.name,
        priceCents: i.price_cents,
        costCents: i.cost_cents,
        qty: i.qty,
      })),
    })),
  });
});

/** GET /api/finances/products?from=&to= — revenus / coûts / marges par produit */
router.get('/products', (req, res) => {
  const period = readPeriod(req, res);
  if (!period) return;
  const c = dateClause('s.delivered_at', period);
  const rows = db
    .prepare(
      `SELECT si.product_id, MAX(si.name) AS name,
              COALESCE(SUM(si.qty), 0) AS units,
              COALESCE(SUM(si.price_cents * si.qty), 0) AS revenue_cents,
              COALESCE(SUM(si.cost_cents * si.qty), 0) AS cost_cents
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
       WHERE 1 = 1${c.where}
       GROUP BY si.product_id
       ORDER BY revenue_cents DESC, units DESC`
    )
    .all(...c.params);
  return res.json({
    products: rows.map((r) => ({
      productId: r.product_id,
      name: r.name,
      units: r.units,
      revenueCents: r.revenue_cents,
      costCents: r.cost_cents,
      marginCents: r.revenue_cents - r.cost_cents,
    })),
  });
});

/** GET /api/finances/expenses */
router.get('/expenses', (_req, res) => {
  const rows = db.prepare('SELECT * FROM expenses ORDER BY date DESC, id DESC').all();
  res.json({
    expenses: rows.map((e) => ({
      id: e.id,
      label: e.label,
      amountCents: e.amount_cents,
      date: e.date,
      createdAt: e.created_at,
    })),
  });
});

function validateExpense(body, partial) {
  const fields = {};
  const errors = [];
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);

  if (!partial || has('label')) {
    const label = typeof body.label === 'string' ? body.label.trim() : '';
    if (label.length < 1 || label.length > 120) errors.push('label: 1 à 120 caractères');
    else fields.label = label;
  }
  if (!partial || has('amountCents')) {
    const amount = body.amountCents;
    if (!Number.isInteger(amount) || amount < 0) errors.push('amountCents: entier ≥ 0');
    else fields.amountCents = amount;
  }
  if (has('date') || !partial) {
    const date = has('date') ? String(body.date ?? '').trim() : nowIso().slice(0, 10);
    if (!DATE_RE.test(date)) errors.push('date: format AAAA-MM-JJ');
    else fields.date = date;
  }
  return { ok: errors.length === 0, fields, errors };
}

/** POST /api/finances/expenses { label, amountCents, date? } → 201 */
router.post('/expenses', (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const { ok, fields, errors } = validateExpense(body, false);
  if (!ok) return res.status(400).json({ error: `Champs invalides: ${errors.join(', ')}` });
  const info = db
    .prepare('INSERT INTO expenses (label, amount_cents, date, created_at) VALUES (?, ?, ?, ?)')
    .run(fields.label, fields.amountCents, fields.date, nowIso());
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(info.lastInsertRowid);
  return res.status(201).json({
    id: row.id,
    label: row.label,
    amountCents: row.amount_cents,
    date: row.date,
    createdAt: row.created_at,
  });
});

/** PATCH /api/finances/expenses/:id */
router.patch('/expenses/:id', (req, res) => {
  const n = Number(req.params.id);
  const existing = Number.isInteger(n) && n > 0 ? db.prepare('SELECT * FROM expenses WHERE id = ?').get(n) : null;
  if (!existing) return res.status(404).json({ error: 'Dépense introuvable' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const { ok, fields, errors } = validateExpense(body, true);
  if (!ok) return res.status(400).json({ error: `Champs invalides: ${errors.join(', ')}` });
  const keys = Object.keys(fields);
  if (keys.length === 0) return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
  const columnFor = { label: 'label', amountCents: 'amount_cents', date: 'date' };
  const sets = keys.map((k) => `${columnFor[k]} = ?`);
  db.prepare(`UPDATE expenses SET ${sets.join(', ')} WHERE id = ?`).run(
    ...keys.map((k) => fields[k]),
    existing.id
  );
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(existing.id);
  return res.json({
    id: row.id,
    label: row.label,
    amountCents: row.amount_cents,
    date: row.date,
    createdAt: row.created_at,
  });
});

/** DELETE /api/finances/expenses/:id → 204 */
router.delete('/expenses/:id', (req, res) => {
  const n = Number(req.params.id);
  const existing = Number.isInteger(n) && n > 0 ? db.prepare('SELECT * FROM expenses WHERE id = ?').get(n) : null;
  if (!existing) return res.status(404).json({ error: 'Dépense introuvable' });
  db.prepare('DELETE FROM expenses WHERE id = ?').run(existing.id);
  return res.status(204).end();
});

export default router;
