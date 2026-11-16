// Smoke test Delivro — démarre le serveur si absent, exécute les endpoints clés, affiche SMOKE OK.
// Usage : npm run smoke   (SMOKE_URL / PUBLIC_URL / PORT pilotent la cible)
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { io as ioClient } from 'socket.io-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const port = process.env.PORT || 3000;
const base = (process.env.SMOKE_URL || process.env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/+$/, '');

let failures = 0;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function api(method, pathname, { token, body, redirect } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(base + pathname, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: redirect || 'follow',
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  return { status: res.status, json, text, location: res.headers.get('location') };
}

async function step(name, fn) {
  try {
    await fn();
    console.log(`[smoke] OK   ${name}`);
  } catch (e) {
    failures++;
    console.log(`[smoke] FAIL ${name} — ${e.message}`);
    throw e;
  }
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const sock = ioClient(base, { auth: { token }, reconnection: false, timeout: 5000 });
    sock.on('connect', () => resolve(sock));
    sock.on('connect_error', (err) => reject(err));
  });
}

function joinConversation(sock, conversationId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('ack conversation:join timeout')), 5000);
    sock.emit('conversation:join', { conversationId }, (ack) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

async function waitForEvent(sock, event, ms = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${event}`)), ms);
    sock.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function runAll() {
  const state = {};

  await step('GET /api/health', async () => {
    const r = await api('GET', '/api/health');
    assert(r.status === 200, `status ${r.status}`);
    assert(r.json && r.json.ok === true, 'ok != true');
    assert(r.json.version === '1.0.0', 'version != 1.0.0');
  });

  await step('POST /api/auth/demo (supplier + client)', async () => {
    // suffixe unique : le rôle (supplier) persiste en base, on repart d'utilisateurs neufs
    const stamp = Date.now().toString(36);
    const a = await api('POST', '/api/auth/demo', { body: { name: `Smoke Supplier ${stamp}` } });
    assert(a.status === 200, `status ${a.status}`);
    assert(a.json.token, 'token manquant');
    assert(a.json.user && a.json.user.role === 'customer', 'role != customer');
    const b = await api('POST', '/api/auth/demo', { body: { name: `Smoke Client ${stamp}` } });
    assert(b.status === 200 && b.json.token, 'demo client KO');
    state.tokenA = a.json.token;
    state.userA = a.json.user;
    state.tokenB = b.json.token;
    state.userB = b.json.user;
  });

  await step('GET /api/auth/me', async () => {
    const r = await api('GET', '/api/auth/me', { token: state.tokenA });
    assert(r.status === 200 && r.json.id === state.userA.id, 'me KO');
  });

  await step('401 sans JWT (GET /api/auth/me, GET /api/orders/mine, POST /api/products)', async () => {
    assert((await api('GET', '/api/auth/me')).status === 401, 'me != 401');
    assert((await api('GET', '/api/orders/mine')).status === 401, 'mine != 401');
    assert((await api('POST', '/api/products', { body: {} })).status === 401, 'POST products != 401');
  });

  await step('GET /api/products (seed ≥ 10) + GET /api/products/:id', async () => {
    const r = await api('GET', '/api/products?available=1');
    assert(r.status === 200, `status ${r.status}`);
    assert(Array.isArray(r.json.products), 'products absent');
    assert(r.json.products.length >= 10, `seed ${r.json.products.length} < 10`);
    const p = r.json.products[0];
    const r2 = await api('GET', `/api/products/${p.id}`);
    assert(r2.status === 200 && r2.json.id === p.id, 'GET by id KO');
    state.products = r.json.products;
  });

  await step('403 POST /api/products sans rôle supplier', async () => {
    const r = await api('POST', '/api/products', {
      token: state.tokenB,
      body: { name: 'Hack', description: '', priceCents: 1, category: 'Test' },
    });
    assert(r.status === 403, `status ${r.status} (attendu 403)`);
  });

  await step('POST /api/orders (201, total recalcé)', async () => {
    const [p1, p2] = state.products;
    const r = await api('POST', '/api/orders', {
      token: state.tokenA,
      body: {
        items: [
          { productId: p1.id, qty: 2 },
          { productId: p2.id, qty: 1 },
        ],
        address: '12 rue des Lilas, Paris',
        phone: '0612345678',
        note: 'Sans oignons',
      },
    });
    assert(r.status === 201, `status ${r.status} ${r.text}`);
    const o = r.json;
    assert(o.status === 'pending', 'status != pending');
    assert(o.totalCents === p1.priceCents * 2 + p2.priceCents, `total ${o.totalCents} attendu ${p1.priceCents * 2 + p2.priceCents}`);
    assert(o.items.length === 2, 'items != 2');
    assert(o.customer && o.customer.id === state.userA.id, 'customer KO');
    state.order = o;
    assert((await api('POST', '/api/orders', { body: {} })).status === 401, 'POST orders sans token != 401');
  });

  await step('POST /api/admin/enter (mauvais code → 403, SUPPLIER-2026 → supplier)', async () => {
    const bad = await api('POST', '/api/admin/enter', { token: state.tokenA, body: { code: 'WRONG' } });
    assert(bad.status === 403 && bad.json.error === 'Code invalide', `mauvais code → ${bad.status}`);
    const r = await api('POST', '/api/admin/enter', { token: state.tokenA, body: { code: '  supplier-2026 ' } });
    assert(r.status === 200, `status ${r.status}`);
    assert(r.json.role === 'supplier', `role = ${r.json.role}`);
    const me = await api('GET', '/api/auth/me', { token: state.tokenA });
    assert(me.json.role === 'supplier', 'me.role != supplier');
  });

  await step('GET /api/orders?status=pending (vue supplier avec customer)', async () => {
    const r = await api('GET', '/api/orders?status=pending', { token: state.tokenA });
    assert(r.status === 200, `status ${r.status}`);
    const found = r.json.orders.find((o) => o.id === state.order.id);
    assert(found, 'commande absente du filtre status');
    assert(found.customer && found.customer.id === state.userA.id, 'customer absent');
  });

  await step('PATCH /api/orders/:id (transitions strictes + 409 + 403)', async () => {
    const id = state.order.id;
    const patch = (status, token = state.tokenA) =>
      api('PATCH', `/api/orders/${id}`, { token, body: { status } });
    assert((await patch('accepted')).status === 200, 'pending→accepted KO');
    const invalid = await patch('delivered');
    assert(invalid.status === 409, `accepted→delivered = ${invalid.status} (attendu 409)`);
    assert((await patch('preparing')).status === 200, 'accepted→preparing KO');
    assert((await patch('delivering')).status === 200, 'preparing→delivering KO');
    assert((await patch('delivered')).status === 200, 'delivering→delivered KO');
    const asCustomer = await api('PATCH', `/api/orders/${id}`, { token: state.tokenB, body: { status: 'accepted' } });
    assert(asCustomer.status === 403, `PATCH customer = ${asCustomer.status} (attendu 403)`);
    const viewAsB = await api('GET', `/api/orders/${id}`, { token: state.tokenB });
    assert(viewAsB.status === 403, `GET order par autrui = ${viewAsB.status} (attendu 403)`);
  });

  await step('GET /api/conversations (client crée, supplier liste)', async () => {
    const asClient = await api('GET', '/api/conversations', { token: state.tokenB });
    assert(asClient.status === 200, `client status ${asClient.status}`);
    assert(asClient.json.conversations.length === 1, 'client != 1 conversation');
    const conv = asClient.json.conversations[0];
    assert(conv.customer.id === state.userB.id, 'customer != client');
    assert(conv.lastMessage === null && conv.unreadCount === 0, 'init lastMessage/unread KO');
    const asSupplier = await api('GET', '/api/conversations', { token: state.tokenA });
    assert(asSupplier.status === 200, `supplier status ${asSupplier.status}`);
    const listed = asSupplier.json.conversations.find((c) => c.id === conv.id);
    assert(listed, 'conversation absente côté supplier');
    assert(listed.customer.id === state.userB.id, 'customer côté supplier KO');
    state.conv = conv;
  });

  await step('Socket.IO : 401 token invalide + conversation:join (ack joined)', async () => {
    let rejected = null;
    try {
      await connectSocket('invalid-token');
    } catch (err) {
      rejected = err;
    }
    assert(rejected, 'connexion socket avec token invalide acceptée !');
    assert(rejected.data && rejected.data.code === 401, `connect_error data.code = ${rejected.data && rejected.data.code}`);
    state.sock = await connectSocket(state.tokenA);
    const ack = await joinConversation(state.sock, state.conv.id);
    assert(ack && ack.status === 'joined', `ack = ${JSON.stringify(ack)}`);
  });

  await step('POST /api/conversations/:id/messages → 201 + event message:new', async () => {
    const body = 'Bonjour, votre commande est prête !';
    const pending = waitForEvent(state.sock, 'message:new');
    const r = await api('POST', `/api/conversations/${state.conv.id}/messages`, {
      token: state.tokenA,
      body: { body },
    });
    assert(r.status === 201, `status ${r.status}`);
    assert(r.json.conversationId === state.conv.id, 'conversationId KO');
    assert(r.json.senderId === state.userA.id, 'senderId KO');
    assert(r.json.senderName === state.userA.name, 'senderName KO');
    assert(r.json.readAt === null, 'readAt != null');
    const live = await pending;
    assert(live.id === r.json.id && live.body === body, `message:new KO ${JSON.stringify(live)}`);
    state.message = r.json;
  });

  await step('GET messages + unread + POST read', async () => {
    const r = await api('GET', `/api/conversations/${state.conv.id}/messages`, { token: state.tokenA });
    assert(r.status === 200, `status ${r.status}`);
    assert(r.json.messages.some((m) => m.id === state.message.id), 'message absent');
    assert(r.json.messages[0].body === 'Bonjour, votre commande est prête !', 'tri ASC KO');
    const unread = await api('GET', '/api/conversations', { token: state.tokenB });
    assert(unread.json.conversations[0].unreadCount === 1, 'unreadCount != 1');
    const read = await api('POST', `/api/conversations/${state.conv.id}/read`, { token: state.tokenB });
    assert(read.status === 204, `read → ${read.status}`);
    const after = await api('GET', '/api/conversations', { token: state.tokenB });
    assert(after.json.conversations[0].unreadCount === 0, 'unreadCount != 0 après read');
    assert(after.json.conversations[0].lastMessage.id === state.message.id, 'lastMessage KO');
  });

  await step('OAuth sans clés : redirect not_configured (pas de 500)', async () => {
    const start = await api('GET', '/api/auth/start?provider=discord', { redirect: 'manual' });
    assert(start.status === 302, `start → ${start.status}`);
    const expected = `${base}/api/auth/failed?reason=not_configured`;
    assert(start.location === expected, `Location = ${start.location} (attendu ${expected})`);
    const failed = await api('GET', '/api/auth/failed?reason=not_configured', { redirect: 'manual' });
    assert(failed.status === 302, `failed → ${failed.status}`);
    assert(failed.location === 'shoptabouffe://auth?error=not_configured', `deep link = ${failed.location}`);
    const cb = await api('GET', '/api/auth/github/callback?code=x&state=y', { redirect: 'manual' });
    assert(cb.status === 302, `callback → ${cb.status}`);
    assert(cb.location && cb.location.startsWith('shoptabouffe://auth?error=state_mismatch'), `callback Location = ${cb.location}`);
    const unknown = await api('GET', '/api/auth/start?provider=nope', { redirect: 'manual' });
    assert(unknown.status === 404, `provider inconnu → ${unknown.status}`);
  });

  if (state.sock) state.sock.close();
}

async function healthOk() {
  try {
    const r = await api('GET', '/api/health');
    return r.status === 200 && r.json && r.json.ok === true;
  } catch {
    return false;
  }
}

async function main() {
  let child = null;
  let childLogs = '';
  if (!(await healthOk())) {
    console.log(`[smoke] serveur absent sur ${base} → démarrage de src/server.js`);
    child = spawn(process.execPath, ['src/server.js'], {
      cwd: root,
      env: { ...process.env, PORT: String(port), PUBLIC_URL: base },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (d) => (childLogs += d));
    child.stderr.on('data', (d) => (childLogs += d));
    let up = false;
    for (let i = 0; i < 50 && !up; i++) {
      await new Promise((r) => setTimeout(r, 200));
      up = await healthOk();
    }
    if (!up) {
      console.error('[smoke] SMOKE FAILED: serveur non démarré');
      console.error(childLogs);
      child.kill();
      process.exit(1);
    }
  }
  try {
    await runAll();
    console.log('SMOKE OK');
  } catch (e) {
    console.error(`SMOKE FAILED: ${e.message}`);
    if (childLogs) console.error(childLogs);
    process.exitCode = 1;
  } finally {
    if (child) child.kill();
  }
}

main();
