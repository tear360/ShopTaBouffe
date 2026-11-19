import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { db, toUser } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

const ADMIN_CODE = (process.env.ADMIN_CODE || '82dha92jdao8210dajod821JS0').trim();

// 10 tentatives / 15 min / IP → 429 sinon
const enterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives, réessayez plus tard' },
});

/** POST /api/admin/enter body { code } */
router.post('/enter', requireAuth, enterLimiter, (req, res) => {
  const raw = req.body && typeof req.body.code === 'string' ? req.body.code.trim() : '';
  if (!raw) return res.status(403).json({ error: 'Code invalide' });
  const normalized = raw.toLowerCase();
  const matchEnv = normalized === ADMIN_CODE.toLowerCase();
  const matchDb = db
    .prepare('SELECT id FROM admin_codes WHERE active = 1 AND LOWER(TRIM(code)) = ?')
    .get(normalized);
  if (!matchEnv && !matchDb) return res.status(403).json({ error: 'Code invalide' });
  const isDemo = req.user && req.user.provider === 'demo';
  if (isDemo) {
    // Statut fournisseur lié à la session (token) : pas de propagation entre appareils.
    db.prepare('INSERT OR REPLACE INTO supplier_sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(
      req.token,
      req.user.id,
      new Date().toISOString()
    );
  } else {
    db.prepare("UPDATE users SET role = 'supplier' WHERE id = ?").run(req.user.id);
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (isDemo) user.role = 'supplier';
  return res.json(toUser(user));
});

/** POST /api/admin/logout-role → remet role=customer */
router.post('/logout-role', requireAuth, (req, res) => {
  const isDemo = req.user && req.user.provider === 'demo';
  if (isDemo) {
    db.prepare('DELETE FROM supplier_sessions WHERE token = ?').run(req.token);
  } else {
    db.prepare("UPDATE users SET role = 'customer' WHERE id = ?").run(req.user.id);
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (isDemo) user.role = 'customer';
  return res.json(toUser(user));
});

export default router;
