/**
 * Test ciblé sécurité du compte (1.0.12) : mot de passe, 2FA, reset, suppression.
 *
 * Prérequis : backend démarré sur PORT (3100 par défaut).
 *   $env:PORT='3100'; $env:PUBLIC_URL='http://localhost:3100'; node src/server.js
 *   node scripts/test_security.mjs
 */
import crypto from 'node:crypto';
import { db, nowIso } from '../src/db.js';
import { signToken } from '../src/auth.js';
import { totpCode } from '../src/totp.js';

const PORT = process.env.PORT || 3100;
const BASE = process.env.SMOKE_URL || `http://127.0.0.1:${PORT}`;
const API = `${BASE.replace(/\/+$/, '')}/api`;
const stamp = Date.now().toString().slice(-8);
const user = { name: 'Secu Test', username: `secu_${stamp}`, password: 'password123' };

async function call(method, path, body, token, expect) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* réponse vide */ }
  if (expect && res.status !== expect) {
    throw new Error(`${method} ${path}: attendu ${expect}, obtenu ${res.status} ${JSON.stringify(data)}`);
  }
  return { status: res.status, data };
}

const ok = (label) => console.log('OK', label);

let r = await call('GET', '/health', undefined, null, 200);
if (!r.data.ok) throw new Error('health KO');
ok('health');

r = await call('POST', '/auth/register', user, null, 201);
let token = r.data.token;
if (!token) throw new Error('pas de token');
ok('register');

await call('POST', '/account/password', { currentPassword: 'mauvais', newPassword: 'nouveau123' }, token, 401);
ok('changement mdp : ancien incorrect refuse');
r = await call('POST', '/account/password', { currentPassword: user.password, newPassword: 'nouveau123' }, token, 200);
const nextToken = r.data.token;
await call('GET', '/account', undefined, token, 401);
ok('ancien token revogue');
await call('GET', '/account', undefined, nextToken, 200);
token = nextToken;
ok('nouveau token valide');

r = await call('POST', '/account/2fa/start', {}, token, 200);
const secret = r.data.secret;
if (!secret || !String(r.data.qrDataUrl || '').startsWith('data:image/png;base64,')) {
  throw new Error('secret ou QR manquant');
}
ok('2fa start + QR PNG');
await call('POST', '/account/2fa/enable', { code: '000000' }, token, 401);
r = await call('POST', '/account/2fa/enable', { code: totpCode(secret) }, token, 200);
const recovery = r.data.recoveryCodes?.[0];
if (!recovery || r.data.recoveryCodes.length !== 8) throw new Error('codes de récupération KO');
ok('2fa enable + 8 codes de récupération');

r = await call('POST', '/auth/login', { username: user.username, password: 'nouveau123' }, null, 200);
if (!r.data.twoFactorRequired || !r.data.challengeToken) throw new Error('challenge 2FA manquant');
const challenge = r.data.challengeToken;
ok('login renvoie challenge 2FA');
await call('POST', '/auth/2fa/verify', { challengeToken: challenge, code: '000000' }, null, 401);
r = await call('POST', '/auth/2fa/verify', { challengeToken: challenge, recoveryCode: recovery.toLowerCase() }, null, 200);
token = r.data.token;
ok('2fa verify via code de récupération');
await call('POST', '/auth/2fa/verify', { challengeToken: challenge, recoveryCode: recovery }, null, 401);
ok('code de récupération consommé');

r = await call('POST', '/auth/login', { username: user.username, password: 'nouveau123' }, null, 200);
r = await call('POST', '/auth/2fa/verify', { challengeToken: r.data.challengeToken, code: totpCode(secret) }, null, 200);
token = r.data.token;
await call('POST', '/account/2fa/disable', { code: totpCode(secret), password: 'nouveau123' }, token, 200);
ok('2fa disable');

await call('POST', '/auth/forgot-password', { email: 'inconnu@example.com' }, null, 200);
ok('forgot-password muet pour un e-mail inconnu');

const row = db.prepare("SELECT id FROM users WHERE provider = 'local' AND provider_id = ?").get(user.username);
db.prepare('UPDATE users SET email = ? WHERE id = ?').run('secu@example.com', row.id);
const resetToken = crypto.randomBytes(32).toString('hex');
db.prepare(
  'INSERT INTO password_resets (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)'
).run(row.id, crypto.createHash('sha256').update(resetToken).digest('hex'),
  new Date(Date.now() + 30 * 60 * 1000).toISOString(), nowIso());
r = await call('GET', `/auth/reset-validate?token=${resetToken}`, undefined, null, 200);
if (!r.data.valid) throw new Error('reset-validate KO');
ok('reset-validate');
await call('POST', '/auth/reset-password', { token: resetToken, password: 'court' }, null, 400);
await call('POST', '/auth/reset-password', { token: resetToken, password: 'reset1234' }, null, 200);
ok('reset-password');
r = await call('GET', `/auth/reset-validate?token=${resetToken}`, undefined, null, 200);
if (r.data.valid) throw new Error('jeton reset réutilisable');
ok('jeton reset consommé');

r = await call('POST', '/auth/login', { username: user.username, password: 'reset1234' }, null, 200);
token = r.data.token;
await call('DELETE', '/account', {}, token, 401);
await call('DELETE', '/account', { password: 'faux' }, token, 401);
ok('suppression refuse sans bon mot de passe');
await call('DELETE', '/account', { password: 'reset1234' }, token, 200);
await call('GET', '/account', undefined, token, 401);
ok('suppression avec mot de passe + token invalidé');

const oauthId = `oauth_${stamp}`;
const info = db.prepare(
  "INSERT INTO users (provider, provider_id, name, email, role, created_at) VALUES ('github', ?, 'OAuth Test', 'oauth@example.com', 'customer', ?)"
).run(oauthId, nowIso());
const oauthToken = signToken(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid));
await call('DELETE', '/account', {}, oauthToken, 400);
await call('DELETE', '/account', { confirm: 'SUPPRIMER' }, oauthToken, 200);
ok('suppression OAuth : confirmation explicite requise');

console.log('SECURITY_TEST_OK');
