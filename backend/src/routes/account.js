import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { db, toUser, nowIso } from '../db.js';
import { sendEmailVerificationMail } from '../mail.js';
import { requireAuth, hashPassword, verifyPassword, revokeTokens, signToken } from '../auth.js';
import { PROVIDERS, isConfigured } from '../oauth.js';
import {
  generateTotpSecret, verifyTotp, otpauthUrl,
  generateRecoveryCodes, hashRecoveryCode,
} from '../totp.js';

const router = Router();

const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://10.0.2.2:3000').replace(/\/+$/, '');

const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
const EMAIL_CODE_RESEND_MS = 60 * 1000;
const EMAIL_CODE_MAX_ATTEMPTS = 5;

/** Limiteur : évite de brute-forcer les codes à 6 chiffres. */
const emailCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
});

function pendingEmailVerification(userId) {
  return db
    .prepare('SELECT * FROM email_verifications WHERE user_id = ? ORDER BY id DESC LIMIT 1')
    .get(userId);
}

function clearEmailVerifications(userId) {
  db.prepare('DELETE FROM email_verifications WHERE user_id = ?').run(userId);
}

function hashEmailCode(salt, code) {
  return crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

function codeWaitSeconds(pending, now = Date.now()) {
  if (!pending) return 0;
  const wait = EMAIL_CODE_RESEND_MS - (now - Date.parse(pending.created_at));
  return wait > 0 ? Math.ceil(wait / 1000) : 0;
}

function freshAccount(userId) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

function identitiesOf(userId) {
  return db
    .prepare(
      `SELECT provider, provider_id AS providerId, email, avatar_url AS avatarUrl, created_at AS createdAt
       FROM user_identities WHERE user_id = ? ORDER BY created_at, id`
    )
    .all(userId);
}

function accountOf(user) {
  return {
    ...toUser(user),
    hasPassword: !!user.password_hash,
    twoFactorEnabled: !!user.totp_enabled,
    identities: identitiesOf(user.id),
  };
}

/** Vrai s'il reste au moins un moyen de connexion après dissociation. */
function canUnlink(user, provider) {
  const others = db
    .prepare('SELECT provider FROM user_identities WHERE user_id = ? AND provider != ?')
    .all(user.id, provider).length;
  // Un mot de passe ne compte que si on ne retire pas justement la identité locale.
  const password = provider !== 'local' && !!user.password_hash;
  return others > 0 || password;
}

/** GET /api/account — profil + identités liées. */
router.get('/', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  return res.json(accountOf(user));
});

/**
 * PATCH /api/account { email?, phone? } — les deux champs sont optionnels.
 * Le téléphone est enregistré directement. Une nouvelle adresse e-mail est
 * d'abord vérifiée par un code envoyé à cette adresse : elle n'est enregistrée
 * que par POST /api/account/email/verify.
 */
router.patch('/', requireAuth, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  if (!has('email') && !has('phone')) {
    return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
  }

  const sets = [];
  const values = [];
  let pendingEmail = null;

  if (has('email')) {
    const raw = body.email;
    if (raw != null && typeof raw !== 'string') {
      return res.status(400).json({ error: 'email: chaîne ou null' });
    }
    const email = typeof raw === 'string' ? raw.trim() : '';
    if (email.length > 180 || (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) {
      return res.status(400).json({ error: 'email: adresse invalide' });
    }
    const current = String(req.user.email || '').toLowerCase();
    if (!email || email.toLowerCase() === current) {
      // Effacement ou adresse inchangée : aucune vérification nécessaire.
      clearEmailVerifications(req.user.id);
      if (!email || current) {
        sets.push('email = ?');
        values.push(email || null);
      }
    } else {
      pendingEmail = email;
    }
  }

  if (has('phone')) {
    const raw = body.phone;
    if (raw != null && typeof raw !== 'string') {
      return res.status(400).json({ error: 'phone: chaîne ou null' });
    }
    const phone = typeof raw === 'string' ? raw.trim() : '';
    if (phone.length > 30 || (phone && !/^[+0-9 ()./-]+$/.test(phone))) {
      return res.status(400).json({ error: 'phone: numéro invalide (30 caractères max)' });
    }
    sets.push('phone = ?');
    values.push(phone || null);
  }

  const saveChanges = () => {
    if (!sets.length) return;
    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values, req.user.id);
  };

  if (!pendingEmail) {
    saveChanges();
    return res.json(accountOf(freshAccount(req.user.id)));
  }

  const previous = pendingEmailVerification(req.user.id);
  const wait = codeWaitSeconds(previous);
  if (previous && previous.email.toLowerCase() === pendingEmail.toLowerCase() && wait > 0) {
    return res.status(429).json({
      error: `Un code a déjà été envoyé. Réessayez dans ${wait} s.`,
      retryAfter: wait,
      verificationRequired: true,
      pendingEmail,
    });
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const salt = crypto.randomBytes(16).toString('hex');
  clearEmailVerifications(req.user.id);
  db.prepare(
    `INSERT INTO email_verifications (user_id, email, salt, code_hash, expires_at, attempts, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`
  ).run(
    req.user.id,
    pendingEmail,
    salt,
    hashEmailCode(salt, code),
    new Date(Date.now() + EMAIL_CODE_TTL_MS).toISOString(),
    nowIso()
  );

  if (!(await sendEmailVerificationMail(pendingEmail, code))) {
    clearEmailVerifications(req.user.id);
    return res.status(503).json({ error: 'Impossible d’envoyer le code de vérification pour le moment.' });
  }

  saveChanges();
  return res.json({
    ...accountOf(freshAccount(req.user.id)),
    verificationRequired: true,
    pendingEmail,
    expiresIn: EMAIL_CODE_TTL_MS / 1000,
    resendAfter: EMAIL_CODE_RESEND_MS / 1000,
  });
});

/** GET /api/account/email/pending — vérification en attente après un rechargement. */
router.get('/email/pending', requireAuth, (req, res) => {
  const pending = pendingEmailVerification(req.user.id);
  if (!pending || Date.parse(pending.expires_at) <= Date.now()) {
    if (pending) clearEmailVerifications(req.user.id);
    return res.json({ pending: false });
  }
  return res.json({
    pending: true,
    email: pending.email,
    expiresAt: pending.expires_at,
    resendAfter: codeWaitSeconds(pending),
  });
});

/** POST /api/account/email/resend — renvoie le code en attente (après 60 s). */
router.post('/email/resend', requireAuth, emailCodeLimiter, async (req, res) => {
  const pending = pendingEmailVerification(req.user.id);
  if (!pending) return res.status(400).json({ error: 'Aucune vérification en attente' });
  if (Date.parse(pending.expires_at) <= Date.now()) {
    clearEmailVerifications(req.user.id);
    return res.status(400).json({ error: 'Code expiré. Renseignez à nouveau l’adresse e-mail.' });
  }
  const wait = codeWaitSeconds(pending);
  if (wait > 0) {
    return res.status(429).json({
      error: `Un code a déjà été envoyé. Réessayez dans ${wait} s.`,
      retryAfter: wait,
    });
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const salt = crypto.randomBytes(16).toString('hex');
  clearEmailVerifications(req.user.id);
  db.prepare(
    `INSERT INTO email_verifications (user_id, email, salt, code_hash, expires_at, attempts, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`
  ).run(
    req.user.id,
    pending.email,
    salt,
    hashEmailCode(salt, code),
    new Date(Date.now() + EMAIL_CODE_TTL_MS).toISOString(),
    nowIso()
  );

  if (!(await sendEmailVerificationMail(pending.email, code))) {
    clearEmailVerifications(req.user.id);
    return res.status(503).json({ error: 'Impossible d’envoyer le code de vérification pour le moment.' });
  }
  return res.json({
    ok: true,
    pendingEmail: pending.email,
    expiresIn: EMAIL_CODE_TTL_MS / 1000,
    resendAfter: EMAIL_CODE_RESEND_MS / 1000,
  });
});

/** POST /api/account/email/verify { code } — enregistre l'e-mail après validation. */
router.post('/email/verify', requireAuth, emailCodeLimiter, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const code = typeof body.code === 'string' ? body.code.replace(/\s+/g, '').trim() : '';
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Saisissez le code à 6 chiffres reçu par e-mail.' });
  }

  const pending = pendingEmailVerification(req.user.id);
  if (!pending) return res.status(400).json({ error: 'Aucune vérification en attente' });
  if (Date.parse(pending.expires_at) <= Date.now()) {
    clearEmailVerifications(req.user.id);
    return res.status(400).json({ error: 'Code expiré. Renseignez à nouveau l’adresse e-mail.' });
  }
  if (pending.attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
    clearEmailVerifications(req.user.id);
    return res.status(429).json({ error: 'Trop de tentatives. Demandez un nouveau code.' });
  }

  const expected = Buffer.from(hashEmailCode(pending.salt, code), 'hex');
  const given = Buffer.from(pending.code_hash, 'hex');
  const valid = expected.length === given.length && crypto.timingSafeEqual(expected, given);
  if (!valid) {
    db.prepare('UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?').run(pending.id);
    return res.status(401).json({
      error: 'Code incorrect',
      remaining: EMAIL_CODE_MAX_ATTEMPTS - pending.attempts - 1,
    });
  }

  db.transaction(() => {
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(pending.email, req.user.id);
    clearEmailVerifications(req.user.id);
  })();
  return res.json(accountOf(freshAccount(req.user.id)));
});

/**
 * POST /api/account/password { currentPassword, newPassword } → { ok, token }
 * L'ancien mot de passe est vérifié avant toute modification. Les jetons déjà
 * émis sont révoqués ; un jeton neuf est renvoyé pour garder la session courante.
 */
router.post('/password', requireAuth, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const next = typeof body.newPassword === 'string' ? body.newPassword : '';
  if (!req.user.password_hash) {
    return res.status(400).json({ error: 'Ce compte n’a pas encore de mot de passe' });
  }
  if (!verifyPassword(current, req.user.password_hash)) {
    return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
  }
  if (next.length < 6) {
    return res.status(400).json({ error: 'Nouveau mot de passe : 6 caractères minimum' });
  }
  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), req.user.id);
    revokeTokens(req.user.id);
  })();
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  return res.json({ ok: true, token: signToken(fresh) });
});

/**
 * POST /api/account/2fa/start → { secret, otpauthUrl, qrDataUrl }
 * Prépare un secret mais ne l'active pas : il faut valider un code avec /enable.
 */
router.post('/2fa/start', requireAuth, async (req, res) => {
  const secret = generateTotpSecret();
  db.prepare('UPDATE users SET totp_pending_secret = ? WHERE id = ?').run(secret, req.user.id);
  const identity = db
    .prepare('SELECT provider_id FROM user_identities WHERE user_id = ? ORDER BY id LIMIT 1')
    .get(req.user.id);
  const label = req.user.email || identity?.provider_id || 'compte';
  const url = otpauthUrl(secret, label);
  let qrDataUrl = null;
  try {
    qrDataUrl = await QRCode.toDataURL(url, {
      type: 'image/png',
      width: 256,
      margin: 1,
      color: { dark: '#101418', light: '#FFFFFF' },
    });
  } catch (err) {
    console.error('[2fa] génération QR impossible :', err && err.message);
  }
  return res.json({ secret, otpauthUrl: url, qrDataUrl });
});

/** POST /api/account/2fa/enable { code } → { enabled, recoveryCodes } */
router.post('/2fa/enable', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user.totp_pending_secret) return res.status(400).json({ error: 'Lancez d’abord la configuration 2FA' });
  const code = String((req.body && req.body.code) || '').trim();
  if (!verifyTotp(user.totp_pending_secret, code)) {
    return res.status(401).json({ error: 'Code incorrect' });
  }
  const codes = generateRecoveryCodes();
  db.transaction(() => {
    db.prepare(
      'UPDATE users SET totp_secret = ?, totp_enabled = 1, totp_pending_secret = NULL WHERE id = ?'
    ).run(user.totp_pending_secret, user.id);
    db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(user.id);
    const insert = db.prepare(
      'INSERT INTO recovery_codes (user_id, code_hash, created_at) VALUES (?, ?, ?)'
    );
    for (const c of codes) insert.run(user.id, hashRecoveryCode(c), nowIso());
  })();
  return res.json({ enabled: true, recoveryCodes: codes });
});

/** POST /api/account/2fa/disable { code, password? } → { enabled: false } */
router.post('/2fa/disable', requireAuth, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user.totp_enabled) return res.status(400).json({ error: 'La 2FA n’est pas activée' });
  const code = String(body.code || '').trim();
  const password = String(body.password || '');
  if (user.password_hash && !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }
  if (!verifyTotp(user.totp_secret, code)) return res.status(401).json({ error: 'Code incorrect' });
  db.transaction(() => {
    db.prepare(
      'UPDATE users SET totp_secret = NULL, totp_enabled = 0, totp_pending_secret = NULL WHERE id = ?'
    ).run(user.id);
    db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(user.id);
  })();
  return res.json({ enabled: false });
});

/**
 * POST /api/account/link { provider, target? } → { url }
 *
 * On renvoie une URL vers /api/auth/start (et non directement vers le
 * fournisseur) : les cookies OAuth sont ainsi posés par le NAVIGATEUR qui
 * ouvrira cette URL — Custom Tab Android inclus. Le callback lie alors
 * l'identité au compte porté par `token`, sans jamais en créer un nouveau.
 */
router.post('/link', requireAuth, (req, res) => {
  const provider = String((req.body && req.body.provider) || '');
  const conf = PROVIDERS[provider];
  if (!conf) return res.status(404).json({ error: 'Fournisseur inconnu' });
  if (!isConfigured(conf)) return res.status(400).json({ error: 'Fournisseur non configuré' });

  const target = req.body && req.body.target === 'app' ? 'app' : 'web';
  const qs = new URLSearchParams({
    provider,
    link: '1',
    token: req.token,
    target,
  });
  return res.json({ url: `${PUBLIC_URL}/api/auth/start?${qs}` });
});

/** DELETE /api/account/unlink/:provider — refuse de laisser le compte sans accès. */
router.delete('/unlink/:provider', requireAuth, (req, res) => {
  const provider = String(req.params.provider || '');
  if (!PROVIDERS[provider] && provider !== 'local') {
    return res.status(404).json({ error: 'Fournisseur inconnu' });
  }
  const identity = db
    .prepare('SELECT * FROM user_identities WHERE user_id = ? AND provider = ?')
    .get(req.user.id, provider);
  if (!identity) return res.status(404).json({ error: 'Identité non liée à ce compte' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!canUnlink(user, provider)) {
    return res.status(409).json({
      error: 'Impossible de dissocier : il ne resterait aucun moyen de se connecter. Ajoutez d’abord une autre identité ou un mot de passe.',
    });
  }

  db.transaction(() => {
    db.prepare('DELETE FROM user_identities WHERE user_id = ? AND provider = ?').run(user.id, provider);
    // Si c'était l'identité "principale", on la remplace par une restante pour
    // que les anciens tokens et le rôle restent cohérents.
    if (user.provider === provider && user.provider_id === identity.provider_id) {
      const next = db.prepare('SELECT * FROM user_identities WHERE user_id = ? ORDER BY id LIMIT 1').get(user.id);
      if (next) {
        db.prepare('UPDATE users SET provider = ?, provider_id = ?, email = ?, avatar_url = ? WHERE id = ?')
          .run(next.provider, next.provider_id, next.email ?? null, next.avatar_url ?? null, user.id);
      }
    }
  })();

  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  return res.json(accountOf(fresh));
});

/**
 * DELETE /api/account — suppression totale du compte et de ses données.
 * Les lignes `sales` / `sale_items` (journal financier) sont volontairement
 * conservées : l'argent rapporté ne disparaît pas avec le compte.
 */
router.delete('/', requireAuth, (req, res) => {
  const userId = req.user.id;
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (req.user.password_hash) {
    const password = String(body.password || '');
    if (!verifyPassword(password, req.user.password_hash)) {
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }
  } else if (String(body.confirm || '') !== 'SUPPRIMER') {
    return res.status(400).json({ error: 'Confirmez la suppression en saisissant SUPPRIMER' });
  }
  db.transaction(() => {
    const convIds = db
      .prepare('SELECT id FROM conversations WHERE customer_id = ? OR supplier_id = ?')
      .all(userId, userId)
      .map((r) => r.id);
    if (convIds.length) {
      const marks = convIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM messages WHERE conversation_id IN (${marks})`).run(...convIds);
      db.prepare(`DELETE FROM conversations WHERE id IN (${marks})`).run(...convIds);
    }
    db.prepare('DELETE FROM messages WHERE sender_id = ?').run(userId);
    db.prepare('DELETE FROM orders WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM supplier_sessions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM email_verifications WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM user_identities WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  })();
  res.clearCookie('oauth_link_token', { path: '/' });
  return res.json({ ok: true });
});

export default router;
