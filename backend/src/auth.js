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

/** Hash d'un mot de passe (scrypt + sel). Format : "salt:hash" (hex). */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/** Vérifie un mot de passe contre un hash stocké (comparaison constante). */
export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  try {
    const computed = crypto.scryptSync(password, salt, 64).toString('hex');
    const a = Buffer.from(computed, 'hex');
    const b = Buffer.from(hash, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** JWT HS256, 30 jours : { sub, role, name, ver }. */
export function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, name: user.name, ver: user.token_version || 0 },
    getJwtSecret(),
    { algorithm: 'HS256', expiresIn: '30d' }
  );
}

/** Jeton de challenge 2FA : 5 minutes, usage unique côté logique d'échange. */
export function signTwoFactorChallenge(user) {
  return jwt.sign({ sub: user.id, purpose: '2fa', ver: user.token_version || 0 }, getJwtSecret(), {
    algorithm: 'HS256',
    expiresIn: '5m',
  });
}

/** Vérifie un challenge 2FA et renvoie l'utilisateur, ou null. */
export function userFromTwoFactorChallenge(token) {
  if (typeof token !== 'string' || !token) return null;
  try {
    const payload = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
    if (payload.purpose !== '2fa') return null;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
    if (!user || (payload.ver || 0) !== (user.token_version || 0)) return null;
    return user;
  } catch {
    return null;
  }
}

/** Invalide tous les JWT déjà émis pour cet utilisateur. */
export function revokeTokens(userId) {
  db.prepare('UPDATE users SET token_version = COALESCE(token_version, 0) + 1 WHERE id = ?').run(userId);
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
  // Un changement / reset de mot de passe invalide les anciens tokens.
  if ((payload.ver || 0) !== (user.token_version || 0)) {
    return res.status(401).json({ error: 'Session expirée, veuillez vous reconnecter' });
  }
  // Sécurité : pour les comptes démo (par nom), le statut fournisseur est
  // lié à la session (token), pas au compte → pas de propagation entre appareils.
  if (user.provider === 'demo') {
    const sess = db.prepare('SELECT 1 FROM supplier_sessions WHERE token = ?').get(match[1]);
    user.role = sess ? 'supplier' : 'customer';
  }
  req.user = user;
  req.token = match[1];
  next();
}

/** Retrouve l'utilisateur depuis un JWT (utilisé par le cookie de liaison OAuth). */
export function userFromToken(token) {
  if (typeof token !== 'string' || !token) return null;
  try {
    const payload = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
    if (!user || (payload.ver || 0) !== (user.token_version || 0)) return null;
    return user;
  } catch {
    return null;
  }
}

/** Middleware : exige le rôle supplier (à poser après requireAuth). */
export function requireSupplier(req, res, next) {
  if (!req.user || req.user.role !== 'supplier') {
    return res.status(403).json({ error: 'Rôle fournisseur requis' });
  }
  next();
}
