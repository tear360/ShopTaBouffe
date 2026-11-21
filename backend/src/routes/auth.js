import crypto from 'node:crypto';
import { Router } from 'express';
import { PROVIDERS, isConfigured, createState, consumeState } from '../oauth.js';
import { db, toUser, nowIso } from '../db.js';
import {
  signToken, requireAuth, userFromToken,
  hashPassword, verifyPassword, signTwoFactorChallenge,
  userFromTwoFactorChallenge, revokeTokens,
} from '../auth.js';
import { verifyTotp, hashRecoveryCode } from '../totp.js';
import { sendPasswordResetMail } from '../mail.js';
import rateLimit from 'express-rate-limit';

const router = Router();

const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://10.0.2.2:3000').replace(/\/+$/, '');
const SCHEME = process.env.APP_REDIRECT_SCHEME || 'shoptabouffe';
const ERROR_REASONS = new Set([
  'not_configured', 'state_mismatch', 'provider_error', 'missing_code',
  'link_invalid', 'identity_taken',
]);

function deepLink(params) {
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v == null ? '' : String(v))}`)
    .join('&');
  return `${SCHEME}://auth?${qs}`;
}

function refreshProfile(userId, profile) {
  db.prepare('UPDATE users SET name = ?, avatar_url = ? WHERE id = ?').run(
    profile.name || '',
    profile.avatarUrl ?? null,
    userId
  );
  // On ne remplace l'email du compte que s'il n'en a pas déjà un (l'email est
  // optionnel et peut avoir été saisi dans les paramètres).
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
  if (user && !user.email && profile.email) {
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(profile.email, userId);
  }
  db.prepare(
    `UPDATE user_identities SET email = ?, avatar_url = ?
     WHERE user_id = ? AND provider_id = ?`
  ).run(profile.email ?? null, profile.avatarUrl ?? null, userId, profile.providerId);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

/** Connexion OAuth : retrouve l'identité liée avant de créer un nouveau compte. */
function upsertOAuthUser(provider, profile) {
  const linked = db
    .prepare(
      `SELECT u.* FROM user_identities i JOIN users u ON u.id = i.user_id
       WHERE i.provider = ? AND i.provider_id = ?`
    )
    .get(provider, profile.providerId);
  if (linked) return refreshProfile(linked.id, profile);

  // Compatibilité avec une base créée avant la table user_identities.
  const legacy = db
    .prepare('SELECT * FROM users WHERE provider = ? AND provider_id = ?')
    .get(provider, profile.providerId);
  if (legacy) {
    db.prepare(
      `INSERT OR IGNORE INTO user_identities
         (user_id, provider, provider_id, email, avatar_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(legacy.id, provider, profile.providerId, profile.email ?? null, profile.avatarUrl ?? null, nowIso());
    return refreshProfile(legacy.id, profile);
  }

  const info = db
    .prepare(
      "INSERT INTO users (provider, provider_id, name, email, avatar_url, role, created_at) VALUES (?, ?, ?, ?, ?, 'customer', ?)"
    )
    .run(
      provider,
      profile.providerId,
      profile.name || '',
      profile.email ?? null,
      profile.avatarUrl ?? null,
      nowIso()
    );
  const userId = Number(info.lastInsertRowid);
  db.prepare(
    `INSERT INTO user_identities (user_id, provider, provider_id, email, avatar_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(userId, provider, profile.providerId, profile.email ?? null, profile.avatarUrl ?? null, nowIso());
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

/** Lie une identité OAuth à un compte existant. Lance une erreur si elle est déjà prise. */
function linkOAuthIdentity(user, provider, profile) {
  const taken = db
    .prepare('SELECT user_id FROM user_identities WHERE provider = ? AND provider_id = ?')
    .get(provider, profile.providerId);
  if (taken) {
    if (taken.user_id === user.id) return refreshProfile(user.id, profile);
    const err = new Error('Cette identité est déjà liée à un autre compte');
    err.code = 'identity_taken';
    throw err;
  }
  db.prepare(
    `INSERT INTO user_identities (user_id, provider, provider_id, email, avatar_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(user.id, provider, profile.providerId, profile.email ?? null, profile.avatarUrl ?? null, nowIso());
  return refreshProfile(user.id, profile);
}

/** GET /api/auth/start?provider=github|google[&target=web] */
router.get('/start', (req, res) => {
  const provider = String(req.query.provider || '');
  const conf = PROVIDERS[provider];
  if (!conf) return res.status(404).json({ error: 'Fournisseur inconnu' });
  // target=web : le client est l'app Windows / le navigateur → retour sur /?token=…
  const isWeb = String(req.query.target || '') === 'web';
  if (!isConfigured(conf)) {
    return res.redirect(
      isWeb
        ? `${PUBLIC_URL}/app?error=not_configured`
        : `${PUBLIC_URL}/api/auth/failed?reason=not_configured`
    );
  }
  // link=1 : on attache l'identité OAuth au compte courant au lieu d'en créer un.
  const isLink = String(req.query.link || '') === '1';
  const rawToken = req.query.token
    ? String(req.query.token)
    : String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (isLink && !userFromToken(rawToken)) {
    return res.status(401).json({ error: 'Session requise pour lier un compte' });
  }

  const state = createState(provider, isLink ? { link: true } : {});
  const cookieOpts = { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000, path: '/' };
  res.cookie('oauth_state', state, cookieOpts);
  res.cookie('oauth_target', isWeb ? 'web' : 'app', cookieOpts);
  if (isLink) res.cookie('oauth_link_token', rawToken, cookieOpts);
  return res.redirect(conf.authorize(state));
});

/** GET /api/auth/failed?reason=… → deep link d'erreur (ou /?error=… côté web) */
router.get('/failed', (req, res) => {
  const reason = ERROR_REASONS.has(String(req.query.reason)) ? String(req.query.reason) : 'provider_error';
  const isWeb = req.cookies && req.cookies.oauth_target === 'web';
  res.clearCookie('oauth_target', { path: '/' });
  if (isWeb) return res.redirect(`${PUBLIC_URL}/app?error=${encodeURIComponent(reason)}`);
  return res.redirect(deepLink({ error: reason }));
});

/** GET /api/auth/:provider/callback?code&state */
router.get('/:provider/callback', async (req, res) => {
  const provider = String(req.params.provider);
  const conf = PROVIDERS[provider];
  const isWeb = req.cookies && req.cookies.oauth_target === 'web';
  const fail = (code) => {
    res.clearCookie('oauth_state', { path: '/' });
    res.clearCookie('oauth_target', { path: '/' });
    res.clearCookie('oauth_link_token', { path: '/' });
    if (isWeb) return res.redirect(`${PUBLIC_URL}/app?error=${encodeURIComponent(code)}`);
    return res.redirect(deepLink({ error: code }));
  };

  // 1) state : cookie + mémoire, une seule consommation
  const state = req.query.state ? String(req.query.state) : '';
  const cookieState = req.cookies && typeof req.cookies.oauth_state === 'string' ? req.cookies.oauth_state : '';
  const stateEntry = consumeState(state, provider);
  if (!state || !cookieState || state !== cookieState || !stateEntry) {
    return fail('state_mismatch');
  }
  // 2) provider configuré ?
  if (!conf || !isConfigured(conf)) return fail('not_configured');
  // 3) code présent ?
  const code = req.query.code ? String(req.query.code) : '';
  if (!code) return fail('missing_code');

  // Flux "lier" : vérifier le token du compte AVANT d'appeler le fournisseur.
  // On ne crée jamais de compte ici, on attache l'identité au compte courant.
  const linkAccount = stateEntry.link ? userFromToken(req.cookies && req.cookies.oauth_link_token) : null;
  if (stateEntry.link && !linkAccount) return fail('link_invalid');

  try {
    const accessToken = await conf.exchange(code);
    const profile = await conf.getProfile(accessToken);

    if (stateEntry.link) {
      const account = linkAccount;
      let user;
      try {
        user = linkOAuthIdentity(account, provider, profile);
      } catch (err) {
        return fail(err.code === 'identity_taken' ? 'identity_taken' : 'provider_error');
      }
      res.clearCookie('oauth_state', { path: '/' });
      res.clearCookie('oauth_target', { path: '/' });
      res.clearCookie('oauth_link_token', { path: '/' });
      return isWeb
        ? res.redirect(`${PUBLIC_URL}/app?linked=${encodeURIComponent(provider)}`)
        : res.redirect(deepLink({ linked: provider, name: user.name }));
    }

    const user = upsertOAuthUser(provider, profile);
    const token = signToken(user);
    res.clearCookie('oauth_state', { path: '/' });
    res.clearCookie('oauth_target', { path: '/' });
    if (isWeb) {
      // Retour app Windows / navigateur : le token passe par l'URL, la page le stocke.
      const qs = new URLSearchParams({
        token,
        name: user.name,
        role: user.role,
      }).toString();
      return res.redirect(`${PUBLIC_URL}/app?${qs}`);
    }
    return res.redirect(
      deepLink({
        token,
        name: user.name,
        avatar: user.avatar_url || '',
        role: user.role,
      })
    );
  } catch (err) {
    console.error(`[oauth] erreur callback ${provider}:`, err && err.message);
    return fail('provider_error');
  }
});

/** POST /api/auth/register body { name, username, password } → { token, user } */
router.post('/register', (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (name.length < 1 || name.length > 80) return res.status(400).json({ error: 'name : 1 à 80 caractères' });
  if (!/^[a-z0-9_.-]{3,32}$/.test(username)) return res.status(400).json({ error: 'username : 3 à 32 caractères (a-z, 0-9, . _ -)' });
  if (password.length < 6) return res.status(400).json({ error: 'password : 6 caractères minimum' });

  const existing = db
    .prepare("SELECT user_id FROM user_identities WHERE provider = 'local' AND provider_id = ?")
    .get(username) ||
    db.prepare("SELECT id AS user_id FROM users WHERE provider = 'local' AND provider_id = ?").get(username);
  if (existing) return res.status(409).json({ error: 'Ce nom d’utilisateur est déjà pris' });

  const info = db
    .prepare(
      "INSERT INTO users (provider, provider_id, name, email, avatar_url, role, password_hash, created_at) VALUES ('local', ?, ?, NULL, NULL, 'customer', ?, ?)"
    )
    .run(username, name, hashPassword(password), nowIso());
  const userId = Number(info.lastInsertRowid);
  db.prepare(
    "INSERT INTO user_identities (user_id, provider, provider_id, created_at) VALUES (?, 'local', ?, ?)"
  ).run(userId, username, nowIso());
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  return res.status(201).json({ token: signToken(user), user: toUser(user) });
});

/** POST /api/auth/login body { username, password } → { token, user } */
router.post('/login', (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !password) return res.status(400).json({ error: 'username et password requis' });

  const user =
    db
      .prepare(
        `SELECT u.* FROM user_identities i JOIN users u ON u.id = i.user_id
         WHERE i.provider = 'local' AND i.provider_id = ?`
      )
      .get(username) ||
    db.prepare("SELECT * FROM users WHERE provider = 'local' AND provider_id = ?").get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Identifiants invalides' });
  }
  // Double authentification : on ne délivre le JWT qu'après vérification du code.
  if (user.totp_enabled && user.totp_secret) {
    return res.json({ twoFactorRequired: true, challengeToken: signTwoFactorChallenge(user) });
  }
  return res.json({ token: signToken(user), user: toUser(user) });
});

/** Limiteur : évite le brute-force des codes 2FA et des liens de reset. */
const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
});

/** POST /api/auth/2fa/verify { challengeToken, code, recoveryCode? } → { token, user } */
router.post('/2fa/verify', sensitiveLimiter, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const user = userFromTwoFactorChallenge(body.challengeToken);
  if (!user) return res.status(401).json({ error: 'Challenge invalide ou expiré' });

  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const recovery = typeof body.recoveryCode === 'string' ? body.recoveryCode.trim().toUpperCase() : '';
  if (code && verifyTotp(user.totp_secret, code)) {
    const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    return res.json({ token: signToken(fresh), user: toUser(fresh) });
  }

  if (recovery) {
    const hash = hashRecoveryCode(recovery);
    const row = db
      .prepare('SELECT id FROM recovery_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL')
      .get(user.id, hash);
    if (row) {
      db.prepare('UPDATE recovery_codes SET used_at = ? WHERE id = ?').run(nowIso(), row.id);
      const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
      return res.json({ token: signToken(fresh), user: toUser(fresh) });
    }
  }
  return res.status(401).json({ error: 'Code invalide' });
});

/**
 * POST /api/auth/forgot-password { email } → { ok: true } dans tous les cas.
 * Un jeton à usage unique (30 min) est stocké hashé et envoyé par e-mail.
 */
router.post('/forgot-password', sensitiveLimiter, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email && email.length <= 180) {
    // Plusieurs comptes peuvent partager la même adresse (OAuth + local) :
    // on privilégie celui qui a un mot de passe, sinon le reset ne part jamais.
    const user = db
      .prepare(
        `SELECT * FROM users WHERE lower(email) = ?
         ORDER BY CASE WHEN password_hash IS NOT NULL AND password_hash <> '' THEN 0 ELSE 1 END, id
         LIMIT 1`
      )
      .get(email);
    if (user && user.password_hash) {
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      db.prepare(
        'INSERT INTO password_resets (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)'
      ).run(user.id, crypto.createHash('sha256').update(token).digest('hex'), expires, nowIso());
      const link = `${PUBLIC_URL}/app?reset=${encodeURIComponent(token)}`;
      await sendPasswordResetMail(user.email, link);
    }
  }
  return res.json({ ok: true });
});

function validResetToken(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  return db
    .prepare(
      `SELECT r.id, r.user_id FROM password_resets r
       WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at > ?
       ORDER BY r.id DESC LIMIT 1`
    )
    .get(crypto.createHash('sha256').update(token).digest('hex'), new Date().toISOString());
}

/** GET /api/auth/reset-validate?token=... → { valid: boolean } */
router.get('/reset-validate', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  return res.json({ valid: !!validResetToken(token) });
});

/** POST /api/auth/reset-password { token, password } → { ok: true } */
router.post('/reset-password', sensitiveLimiter, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const reset = validResetToken(body.token);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!reset) return res.status(400).json({ error: 'Lien invalide ou expiré' });
  if (password.length < 6) return res.status(400).json({ error: 'password : 6 caractères minimum' });

  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), reset.user_id);
    // Invalide tous les jetons émis avant la réinitialisation, puis consomme le lien.
    revokeTokens(reset.user_id);
    db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').run(nowIso(), reset.id);
  })();
  return res.json({ ok: true });
});

/** POST /api/auth/upgrade body { name?, username, password } (auth requise, compte démo uniquement)
 *  → transforme le compte démo en compte local, en conservant l'id (et donc les données). */
router.post('/upgrade', requireAuth, (req, res) => {
  if (!req.user || req.user.provider !== 'demo') {
    return res.status(403).json({ error: 'Réservé aux comptes créés par nom' });
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : req.user.name;
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (name.length < 1 || name.length > 80) return res.status(400).json({ error: 'name : 1 à 80 caractères' });
  if (!/^[a-z0-9_.-]{3,32}$/.test(username)) return res.status(400).json({ error: 'username : 3 à 32 caractères (a-z, 0-9, . _ -)' });
  if (password.length < 6) return res.status(400).json({ error: 'password : 6 caractères minimum' });

  const existing = db
    .prepare("SELECT user_id FROM user_identities WHERE provider = 'local' AND provider_id = ?")
    .get(username) ||
    db.prepare("SELECT id AS user_id FROM users WHERE provider = 'local' AND provider_id = ?").get(username);
  if (existing && existing.user_id !== req.user.id) {
    return res.status(409).json({ error: 'Ce nom d’utilisateur est déjà pris' });
  }

  db.prepare(
    "UPDATE users SET provider = 'local', provider_id = ?, name = ?, password_hash = ? WHERE id = ?"
  ).run(username, name, hashPassword(password), req.user.id);
  db.prepare("DELETE FROM user_identities WHERE user_id = ? AND provider = 'demo'").run(req.user.id);
  db.prepare(
    "INSERT OR REPLACE INTO user_identities (user_id, provider, provider_id, created_at) VALUES (?, 'local', ?, ?)"
  ).run(req.user.id, username, nowIso());

  // Le statut fournisseur éventuel était lié à la session (token) : on le conserve
  // pour ce token en le ré-enregistrant (la session reste fournisseur).
  const wasSupplier = db.prepare('SELECT 1 FROM supplier_sessions WHERE token = ?').get(req.token);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (wasSupplier) {
    db.prepare('INSERT OR REPLACE INTO supplier_sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(
      req.token,
      user.id,
      new Date().toISOString()
    );
  }
  return res.json({ token: signToken(user), user: toUser(user) });
});

/**
 * Connexion par nom SUPPRIMÉE : aucun nouveau compte invité n'est créé.
 * Les comptes `demo` existants ne sont PAS supprimés : leur token reste valide
 * et POST /auth/upgrade leur permet de finaliser leur compte en conservant
 * leur id (donc toutes leurs données).
 */
router.post('/demo', (_req, res) => {
  return res.status(410).json({
    error: 'La connexion par nom n’est plus disponible. Finalisez votre compte en cours avec un nom d’utilisateur et un mot de passe.',
  });
});

/** GET /api/auth/me → User */
router.get('/me', requireAuth, (req, res) => {
  res.json(toUser(req.user));
});

export default router;
