import { Router } from 'express';
import QRCode from 'qrcode';
import { db, toUser, nowIso } from '../db.js';
import { requireAuth, hashPassword, verifyPassword, revokeTokens, signToken } from '../auth.js';
import { PROVIDERS, isConfigured } from '../oauth.js';
import {
  generateTotpSecret, verifyTotp, otpauthUrl,
  generateRecoveryCodes, hashRecoveryCode,
} from '../totp.js';

const router = Router();

const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://10.0.2.2:3000').replace(/\/+$/, '');

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

/** PATCH /api/account { email?, phone? } — les deux champs sont optionnels. */
router.patch('/', requireAuth, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  const sets = [];
  const values = [];

  if (has('email')) {
    const raw = body.email;
    if (raw != null && typeof raw !== 'string') {
      return res.status(400).json({ error: 'email: chaîne ou null' });
    }
    const email = typeof raw === 'string' ? raw.trim() : '';
    if (email.length > 180 || (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) {
      return res.status(400).json({ error: 'email: adresse invalide' });
    }
    sets.push('email = ?');
    values.push(email || null);
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

  if (!sets.length) return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
  values.push(req.user.id);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  return res.json(accountOf(user));
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
    db.prepare('DELETE FROM user_identities WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  })();
  res.clearCookie('oauth_link_token', { path: '/' });
  return res.json({ ok: true });
});

export default router;
