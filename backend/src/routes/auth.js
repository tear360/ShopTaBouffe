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

/** GET /api/auth/start?provider=discord|github|google */
router.get('/start', (req, res) => {
  const provider = String(req.query.provider || '');
  const conf = PROVIDERS[provider];
  if (!conf) return res.status(404).json({ error: 'Fournisseur inconnu' });
  if (!isConfigured(conf)) {
    return res.redirect(`${PUBLIC_URL}/api/auth/failed?reason=not_configured`);
  }
  const state = createState(provider);
  res.cookie('oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000,
    path: '/',
  });
  return res.redirect(conf.authorize(state));
});

/** GET /api/auth/failed?reason=… → deep link d'erreur */
router.get('/failed', (req, res) => {
  const reason = ERROR_REASONS.has(String(req.query.reason)) ? String(req.query.reason) : 'provider_error';
  return res.redirect(deepLink({ error: reason }));
});

/** GET /api/auth/:provider/callback?code&state */
router.get('/:provider/callback', async (req, res) => {
  const provider = String(req.params.provider);
  const conf = PROVIDERS[provider];
  const fail = (code) => {
    res.clearCookie('oauth_state', { path: '/' });
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
