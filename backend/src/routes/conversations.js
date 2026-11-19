import { Router } from 'express';
import { db, nowIso } from '../db.js';
import { requireAuth } from '../auth.js';
import { getIO } from '../sockets.js';

const router = Router();

/** Conversation du client : créée à la volée si absente (supplier = 1er supplier connu). */
function ensureClientConversation(userId) {
  let conv = db.prepare('SELECT * FROM conversations WHERE customer_id = ?').get(userId);
  if (!conv) {
    const supplier = db.prepare("SELECT id FROM users WHERE role = 'supplier' ORDER BY id LIMIT 1").get();
    const ts = nowIso();
    const info = db
      .prepare('INSERT INTO conversations (customer_id, supplier_id, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(userId, supplier ? supplier.id : null, ts, ts);
    conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(info.lastInsertRowid);
  } else if (conv.supplier_id == null) {
    const supplier = db.prepare("SELECT id FROM users WHERE role = 'supplier' ORDER BY id LIMIT 1").get();
    if (supplier) {
      db.prepare('UPDATE conversations SET supplier_id = ? WHERE id = ?').run(supplier.id, conv.id);
      conv.supplier_id = supplier.id;
    }
  }
  return conv;
}

function conversationToJson(conv, viewerId) {
  const last = db
    .prepare('SELECT id, body, created_at, sender_id FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1')
    .get(conv.id);
  const unread = db
    .prepare(
      'SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL'
    )
    .get(conv.id, viewerId).n;
  const customer = db.prepare('SELECT id, name, avatar_url FROM users WHERE id = ?').get(conv.customer_id);
  return {
    id: conv.id,
    customer: customer ? { id: customer.id, name: customer.name, avatarUrl: customer.avatar_url ?? null } : null,
    lastMessage: last
      ? { id: last.id, body: last.body, createdAt: last.created_at, senderId: last.sender_id }
      : null,
    unreadCount: unread,
    updatedAt: conv.updated_at,
  };
}

function toMessage(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at ?? null,
  };
}

/** Charge la conversation et vérifie la participation (404/403 sinon). */
function loadParticipantConversation(req, res) {
  const id = Number(req.params.id);
  const conv = Number.isInteger(id) && id > 0
    ? db.prepare('SELECT * FROM conversations WHERE id = ?').get(id)
    : null;
  if (!conv) {
    res.status(404).json({ error: 'Conversation introuvable' });
    return null;
  }
  // Client : son propre fil. Fournisseur : tous les fils (compte admin du point de vente).
  const isCustomer = conv.customer_id === req.user.id;
  const isSupplier = req.user.role === 'supplier';
  if (!isCustomer && !isSupplier) {
    res.status(403).json({ error: 'Accès refusé' });
    return null;
  }
  return conv;
}

/** GET /api/conversations */
router.get('/', requireAuth, (req, res) => {
  let convs;
  if (req.user.role === 'supplier') {
    // adoption des conversations orphelines (sans supplier assigné)
    db.prepare('UPDATE conversations SET supplier_id = ? WHERE supplier_id IS NULL').run(req.user.id);
    convs = db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC, id DESC').all();
  } else {
    convs = [ensureClientConversation(req.user.id)];
  }
  res.json({ conversations: convs.map((c) => conversationToJson(c, req.user.id)) });
});

/** GET /api/conversations/:id/messages?before=&limit= */
router.get('/:id/messages', requireAuth, (req, res) => {
  const conv = loadParticipantConversation(req, res);
  if (!conv) return undefined;
  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 50;
  const before = req.query.before ? Number(req.query.before) : NaN;
  const params = [conv.id];
  let sql =
    'SELECT m.*, u.name AS sender_name FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.conversation_id = ?';
  if (Number.isInteger(before) && before > 0) {
    sql += ' AND m.id < ?';
    params.push(before);
  }
  // dernières `limit` messages (avant `before`), renvoyés en tri ASC
  sql += ' ORDER BY m.id DESC LIMIT ?';
  params.push(limit);
  const rows = db.prepare(sql).all(...params).reverse();
  return res.json({ messages: rows.map(toMessage) });
});

/** POST /api/conversations/:id/messages body { body } → 201 */
router.post('/:id/messages', requireAuth, (req, res) => {
  const conv = loadParticipantConversation(req, res);
  if (!conv) return undefined;
  const body = req.body && typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (body.length < 1 || body.length > 1000) {
    return res.status(400).json({ error: 'body: 1 à 1000 caractères' });
  }
  const ts = nowIso();
  // un fournisseur qui répond adopte la conversation si elle n'a pas encore de fournisseur
  if (req.user.role === 'supplier' && conv.supplier_id == null) {
    db.prepare('UPDATE conversations SET supplier_id = ? WHERE id = ?').run(req.user.id, conv.id);
    conv.supplier_id = req.user.id;
  }
  const info = db
    .prepare('INSERT INTO messages (conversation_id, sender_id, body, created_at, read_at) VALUES (?, ?, ?, ?, NULL)')
    .run(conv.id, req.user.id, body, ts);
  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(ts, conv.id);
  const row = db
    .prepare(
      'SELECT m.*, u.name AS sender_name FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?'
    )
    .get(info.lastInsertRowid);
  const message = toMessage(row);
  getIO()?.to(`conv:${conv.id}`).emit('message:new', message);
  return res.status(201).json(message);
});

/** POST /api/conversations/:id/read → 204 */
router.post('/:id/read', requireAuth, (req, res) => {
  const conv = loadParticipantConversation(req, res);
  if (!conv) return undefined;
  db.prepare(
    'UPDATE messages SET read_at = ? WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL'
  ).run(nowIso(), conv.id, req.user.id);
  return res.status(204).end();
});

export default router;
