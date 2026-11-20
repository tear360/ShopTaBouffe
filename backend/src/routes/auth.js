import crypto from 'node:crypto';
import { Router } from 'express';
import { PROVIDERS, isConfigured, createState, consumeState } from '../oauth.js';
import { db, toUser, nowIso } from '../db.js';
import { signToken, requireAuth } from '../auth.js';

const router = Router();

const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://10.0.2.2:3000').replace(/\/+$/, '');
const SCHEME = process.env.APP_REDIRECT_SCHEME || 'shoptabouffe';
const ERROR_REASONS = new Set(['not_configured', 'state_mismatch', 'provider_error', 'missing_code']);

function deepLink(params) {
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v == null ? '' : String(v))}`)
    .join('&');
  return `${SCHEME}://auth?${qs}`;
}

function upsertOAuthUser(provider, profile) {
  const existing = db
    .prepare('SELECT * FROM users WHERE provider = ? AND provider_id = ?')
    .get(provider, profile.providerId);
  if (existing) {
    db.prepare('UPDATE users SET name = ?, email = ?, avatar_url = ? WHERE id = ?').run(
      profile.name || existing.name,
      profile.email != null ? profile.email : existing.email,
      profile.avatarUrl != null ? profile.avatarUrl : existing.avatar_url,
      existing.id
    );
    return db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id);
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
  return db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
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
  const state = createState(provider);
  res.cookie('oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000,
    path: '/',
  });
  res.cookie('oauth_target', isWeb ? 'web' : 'app', {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000,
    path: '/',
  });
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
    if (isWeb) return res.redirect(`${PUBLIC_URL}/app?error=${encodeURIComponent(code)}`);
    return res.redirect(deepLink({ error: code }));
  };

  // 1) state : cookie + mémoire, une seule consommation
  const state = req.query.state ? String(req.query.state) : '';
  const cookieState = req.cookies && typeof req.cookies.oauth_state === 'string' ? req.cookies.oauth_state : '';
  if (!state || !cookieState || state !== cookieState || !consumeState(state, provider)) {
    return fail('state_mismatch');
  }
  // 2) provider configuré ?
  if (!conf || !isConfigured(conf)) return fail('not_configured');
  // 3) code présent ?
  const code = req.query.code ? String(req.query.code) : '';
  if (!code) return fail('missing_code');

  try {
    const accessToken = await conf.exchange(code);
    const profile = await conf.getProfile(accessToken);
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

/** Hash d'un mot de passe (scrypt + sel). Format : "salt:hash" (hex). */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/** Vérifie un mot de passe contre un hash stocké. */
function verifyPassword(password, stored) {
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

/** POST /api/auth/register body { name, username, password } → { token, user } */
router.post('/register', (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (name.length < 1 || name.length > 80) return res.status(400).json({ error: 'name : 1 à 80 caractères' });
  if (!/^[a-z0-9_.-]{3,32}$/.test(username)) return res.status(400).json({ error: 'username : 3 à 32 caractères (a-z, 0-9, . _ -)' });
  if (password.length < 6) return res.status(400).json({ error: 'password : 6 caractères minimum' });

  const existing = db.prepare("SELECT id FROM users WHERE provider = 'local' AND provider_id = ?").get(username);
  if (existing) return res.status(409).json({ error: 'Ce nom d’utilisateur est déjà pris' });

  const info = db
    .prepare(
      "INSERT INTO users (provider, provider_id, name, email, avatar_url, role, password_hash, created_at) VALUES ('local', ?, ?, NULL, NULL, 'customer', ?, ?)"
    )
    .run(username, name, hashPassword(password), nowIso());
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  return res.status(201).json({ token: signToken(user), user: toUser(user) });
});

/** POST /api/auth/login body { username, password } → { token, user } */
router.post('/login', (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !password) return res.status(400).json({ error: 'username et password requis' });

  const user = db.prepare("SELECT * FROM users WHERE provider = 'local' AND provider_id = ?").get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Identifiants invalides' });
  }
  return res.json({ token: signToken(user), user: toUser(user) });
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

  const existing = db.prepare("SELECT id FROM users WHERE provider = 'local' AND provider_id = ?").get(username);
  if (existing) return res.status(409).json({ error: 'Ce nom d’utilisateur est déjà pris' });

  db.prepare(
    "UPDATE users SET provider = 'local', provider_id = ?, name = ?, password_hash = ? WHERE id = ?"
  ).run(username, name, hashPassword(password), req.user.id);

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

/** POST /api/auth/demo body { name } */
router.post('/demo', (req, res) => {
  if (String(process.env.ALLOW_DEMO_LOGIN ?? 'true').toLowerCase() === 'false') {
    return res.status(403).json({ error: 'Login démo désactivé' });
  }
  const name = req.body && typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (name.length < 1 || name.length > 80) {
    return res.status(400).json({ error: 'name requis (1 à 80 caractères)' });
  }
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'user';
  const providerId = `demo:${slug}`;
  let user = db
    .prepare("SELECT * FROM users WHERE provider = 'demo' AND provider_id = ?")
    .get(providerId);
  if (!user) {
    const info = db
      .prepare(
        "INSERT INTO users (provider, provider_id, name, email, avatar_url, role, created_at) VALUES ('demo', ?, ?, NULL, NULL, 'customer', ?)"
      )
      .run(providerId, name, nowIso());
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  }
  return res.json({ token: signToken(user), user: toUser(user) });
});

/** GET /api/auth/me → User */
router.get('/me', requireAuth, (req, res) => {
  res.json(toUser(req.user));
});

export default router;
