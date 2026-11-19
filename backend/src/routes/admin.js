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
  db.prepare("UPDATE users SET role = 'supplier' WHERE id = ?").run(req.user.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  return res.json(toUser(user));
});

/** POST /api/admin/logout-role → remet role=customer */
router.post('/logout-role', requireAuth, (req, res) => {
  db.prepare("UPDATE users SET role = 'customer' WHERE id = ?").run(req.user.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  return res.json(toUser(user));
});

export default router;
