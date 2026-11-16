import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { db, toUser } from './db.js';

let cachedSecret = null;

/** JWT_SECRET (env) sinon secret aléatoire persisté dans la table settings. */
export function getJwtSecret() {
  if (cachedSecret) return cachedSecret;
  if (process.env.JWT_SECRET) {
    cachedSecret = process.env.JWT_SECRET;
    return cachedSecret;
  }
  const row = db.prepare("SELECT value FROM settings WHERE key = 'jwt_secret'").get();
  if (row && row.value) {
    cachedSecret = row.value;
    return cachedSecret;
  }
  const secret = crypto.randomBytes(32).toString('hex');
  db.prepare("INSERT INTO settings (key, value) VALUES ('jwt_secret', ?)").run(secret);
  cachedSecret = secret;
  return cachedSecret;
}

/** JWT HS256, 30 jours : { sub, role, name }. */
export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, name: user.name }, getJwtSecret(), {
    algorithm: 'HS256',
    expiresIn: '30d',
  });
}

/** Middleware : exige Authorization: Bearer <JWT> (charge req.user fraîchement en DB). */
export function requireAuth(req, res, next) {
  const header = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return res.status(401).json({ error: 'Token manquant' });
  let payload;
  try {
    payload = jwt.verify(match[1], getJwtSecret(), { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
  if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
  req.user = user;
  next();
}

/** Middleware : exige le rôle supplier (à poser après requireAuth). */
export function requireSupplier(req, res, next) {
  if (!req.user || req.user.role !== 'supplier') {
    return res.status(403).json({ error: 'Rôle fournisseur requis' });
  }
  next();
}
