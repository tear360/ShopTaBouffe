// Smoke test Delivro — démarre le serveur si absent, exécute les endpoints clés, affiche SMOKE OK.
// Usage : npm run smoke   (SMOKE_URL / PUBLIC_URL / PORT pilotent la cible)
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { io as ioClient } from 'socket.io-client';
import { db } from '../src/db.js';
import { signToken } from '../src/auth.js';
import { purgeCompletedOrders } from '../src/cleanup.js';

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

  await step('POST /api/auth/register + comptes vérifiés (chat autorisé)', async () => {
    // suffixe unique : le rôle (supplier) persiste en base, on repart d'utilisateurs neufs
    const stamp = Date.now().toString(36);
    const a = await api('POST', '/api/auth/register', {
      body: { name: `Smoke Supplier ${stamp}`, username: `smokesup_${stamp}`, password: 'password123' },
    });
    assert(a.status === 201, `status ${a.status}`);
    assert(a.json.token, 'token manquant');
    assert(a.json.user && a.json.user.role === 'customer', 'role != customer');
    const b = await api('POST', '/api/auth/register', {
      body: { name: `Smoke Client ${stamp}`, username: `smokecli_${stamp}`, password: 'password123' },
    });
    assert(b.status === 201 && b.json.token, 'register client KO');
    state.tokenA = a.json.token;
    state.userA = a.json.user;
    state.tokenB = b.json.token;
    state.userB = b.json.user;

    // Compte OAuth (provider github) : sert de client avec historique de chat.
    const info = db
      .prepare(
        "INSERT INTO users (provider, provider_id, name, email, avatar_url, role, created_at) " +
          "VALUES ('github', ?, ?, NULL, NULL, 'customer', ?)"
      )
      .run(`smoke-${stamp}`, `Smoke Client GH ${stamp}`, new Date().toISOString());
    const ghId = Number(info.lastInsertRowid);
    db.prepare(
      "INSERT INTO user_identities (user_id, provider, provider_id, created_at) VALUES (?, 'github', ?, ?)"
    ).run(ghId, `smoke-${stamp}`, new Date().toISOString());
    const gh = db.prepare('SELECT * FROM users WHERE id = ?').get(ghId);
    state.tokenGH = signToken(gh);
    state.userGH = gh;
  });

  await step('Chat autorisé au compte sans nom (démo)', async () => {
    const conv = await api('GET', '/api/conversations', { token: state.tokenB });
    assert(conv.status === 200, `GET conversations → ${conv.status}`);
    assert(Array.isArray(conv.json.conversations) && conv.json.conversations.length === 1, 'client != 1 conversation');
    const id = conv.json.conversations[0].id;
    const msg = await api('GET', `/api/conversations/${id}/messages`, { token: state.tokenB });
    assert(msg.status === 200 && Array.isArray(msg.json.messages), `messages → ${msg.status}`);
    const read = await api('POST', `/api/conversations/${id}/read`, { token: state.tokenB });
    assert(read.status === 204, `read → ${read.status}`);
    state.guestConvId = id;
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

  await step('POST /api/admin/enter (mauvais code → 403, nouveau code → supplier)', async () => {
    const bad = await api('POST', '/api/admin/enter', { token: state.tokenA, body: { code: 'WRONG' } });
    assert(bad.status === 403 && bad.json.error === 'Code invalide', `mauvais code → ${bad.status}`);
    const r = await api('POST', '/api/admin/enter', { token: state.tokenA, body: { code: '  82dha92jdao8210dajod821js0 ' } });
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

  await step('PATCH /api/products/:id (prix de revient costCents)', async () => {
    const p = state.products[0];
    state.origCost = p.costCents ?? 0;
    const r = await api('PATCH', `/api/products/${p.id}`, {
      token: state.tokenA,
      body: { costCents: 350 },
    });
    assert(r.status === 200, `status ${r.status} ${r.text}`);
    assert(r.json.costCents === 350, `costCents = ${r.json.costCents}`);
    const anon = await api('PATCH', `/api/products/${p.id}`, { body: { costCents: 1 } });
    assert(anon.status === 401, `PATCH sans token = ${anon.status}`);
    const bad = await api('PATCH', `/api/products/${p.id}`, {
      token: state.tokenA,
      body: { costCents: -5 },
    });
    assert(bad.status === 400, `costCents négatif = ${bad.status} (attendu 400)`);
    state.products[0] = r.json;
  });

  await step('Remise temporaire produit/formule : validation, calcul, expiration', async () => {
    const p = state.products[0];
    const normal = p.priceCents;
    const sale = Math.floor(normal / 2);
    const orderBody = (productId, qty) => ({
      items: [{ productId, qty }],
      address: '12 rue des Lilas, Paris',
      phone: '0612345678',
    });

    const anon = await api('POST', `/api/products/${p.id}/discount`, { body: { priceCents: sale, durationHours: 24 } });
    assert(anon.status === 401, `POST discount sans token = ${anon.status}`);
    const forbidden = await api('POST', `/api/products/${p.id}/discount`, { token: state.tokenB, body: { priceCents: sale, durationHours: 24 } });
    assert(forbidden.status === 403, `POST discount client = ${forbidden.status}`);
    const invalid = await api('POST', `/api/products/${p.id}/discount`, { token: state.tokenA, body: { priceCents: normal, durationHours: 24 } });
    assert(invalid.status === 400, `prix remisé = prix normal → ${invalid.status}`);
    const badHours = await api('POST', `/api/products/${p.id}/discount`, { token: state.tokenA, body: { priceCents: sale, durationHours: 0 } });
    assert(badHours.status === 400, `durée 0 → ${badHours.status}`);

    const set = await api('POST', `/api/products/${p.id}/discount`, { token: state.tokenA, body: { priceCents: sale, durationHours: 24 } });
    assert(set.status === 200, `status ${set.status} ${set.text}`);
    assert(set.json.discountPriceCents === sale, `discountPriceCents = ${set.json.discountPriceCents}`);
    assert(set.json.priceCents === normal, 'prix normal écrasé par la remise');
    assert(set.json.discountUntil && Date.parse(set.json.discountUntil) > Date.now(), 'discountUntil invalide');

    const discounted = await api('POST', '/api/orders', { token: state.tokenA, body: orderBody(p.id, 2) });
    assert(discounted.status === 201, `commande remisée ${discounted.status}`);
    assert(discounted.json.totalCents === sale * 2, `total remisé ${discounted.json.totalCents} attendu ${sale * 2}`);
    assert(discounted.json.items[0].priceCents === sale, 'prix de ligne non remisé');

    // Expiration simulée : le prix normal reprend sans intervention.
    db.prepare('UPDATE products SET discount_until = ? WHERE id = ?')
      .run(new Date(Date.now() - 1000).toISOString(), p.id);
    const expired = await api('GET', `/api/products/${p.id}`);
    assert(expired.json.discountPriceCents === null && expired.json.discountUntil === null, 'remise expirée encore exposée');
    const full = await api('POST', '/api/orders', { token: state.tokenA, body: orderBody(p.id, 1) });
    assert(full.status === 201 && full.json.totalCents === normal, `prix après expiration ${full.json.totalCents} attendu ${normal}`);

    // Une formule est un produit : même endpoint, même recalcul.
    const created = await api('POST', '/api/formules', {
      token: state.tokenA,
      body: {
        name: `SmokeFormule ${Date.now().toString(36)}`,
        description: '',
        priceCents: 1000,
        category: 'Formules',
        items: [{ productId: p.id, qty: 1 }],
        available: true,
      },
    });
    assert(created.status === 201, `création formule ${created.status} ${created.text}`);
    const f = created.json;
    const fSale = 700;
    const fSet = await api('POST', `/api/products/${f.id}/discount`, { token: state.tokenA, body: { priceCents: fSale, durationHours: 2 } });
    assert(fSet.status === 200 && fSet.json.discountPriceCents === fSale, `remise formule ${fSet.status}`);
    const fOrder = await api('POST', '/api/orders', { token: state.tokenA, body: orderBody(f.id, 1) });
    assert(fOrder.status === 201 && fOrder.json.totalCents === fSale, `commande formule remisée ${fOrder.json.totalCents}`);

    const clearedF = await api('DELETE', `/api/products/${f.id}/discount`, { token: state.tokenA });
    assert(clearedF.status === 200 && clearedF.json.discountPriceCents === null, `DELETE remise formule ${clearedF.status}`);
    const clearedP = await api('DELETE', `/api/products/${p.id}/discount`, { token: state.tokenA });
    assert(clearedP.status === 200 && clearedP.json.discountPriceCents === null, `DELETE remise produit ${clearedP.status}`);

    // Nettoyage : ces commandes restent pending (aucune vente journalisée).
    for (const id of [discounted.json.id, full.json.id, fOrder.json.id]) {
      db.prepare('DELETE FROM order_items WHERE order_id = ?').run(id);
      db.prepare('DELETE FROM orders WHERE id = ?').run(id);
    }
    db.prepare('DELETE FROM formule_items WHERE formule_id = ?').run(f.id);
    db.prepare('DELETE FROM products WHERE id = ?').run(f.id);
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

  await step('GET /api/categories (public, seed ≥ 10)', async () => {
    const r = await api('GET', '/api/categories');
    assert(r.status === 200, `status ${r.status}`);
    assert(Array.isArray(r.json.categories), 'categories absent');
    assert(r.json.categories.length >= 10, `seed ${r.json.categories.length} < 10`);
    const c = r.json.categories[0];
    assert(c.name && typeof c.productsCount === 'number', 'shape catégorie KO');
  });

  await step('CRUD catégories (supplier) + 403 client', async () => {
    const stamp = Date.now().toString(36);
    const name = `SmokeCat ${stamp}`;
    const forbidden = await api('POST', '/api/categories', { token: state.tokenB, body: { name } });
    assert(forbidden.status === 403, `POST client = ${forbidden.status} (attendu 403)`);

    const created = await api('POST', '/api/categories', { token: state.tokenA, body: { name } });
    assert(created.status === 201, `POST → ${created.status} ${created.text}`);
    const catId = created.json.id;

    const dup = await api('POST', '/api/categories', { token: state.tokenA, body: { name } });
    assert(dup.status === 409, `doublon → ${dup.status} (attendu 409)`);
    const missing = await api('POST', '/api/categories', { token: state.tokenA, body: {} });
    assert(missing.status === 400, `sans name → ${missing.status} (attendu 400)`);

    // produit dans la catégorie
    const prod = await api('POST', '/api/products', {
      token: state.tokenA,
      body: { name: `SmokeProd ${stamp}`, description: '', priceCents: 1000, costCents: 400, category: name },
    });
    assert(prod.status === 201, `POST product → ${prod.status} ${prod.text}`);
    assert(prod.json.costCents === 400, `costCents = ${prod.json.costCents}`);
    const prodId = prod.json.id;

    // renommage → les produits suivent (filtres non cassés)
    const newName = `${name} bis`;
    const renamed = await api('PATCH', `/api/categories/${catId}`, {
      token: state.tokenA,
      body: { name: newName },
    });
    assert(renamed.status === 200 && renamed.json.name === newName, `PATCH → ${renamed.status}`);
    const check = await api('GET', `/api/products/${prodId}`);
    assert(check.json.category === newName, `produit.category = ${check.json.category} (attendu ${newName})`);
    const notFound = await api('PATCH', '/api/categories/99999999', {
      token: state.tokenA,
      body: { name: 'x' },
    });
    assert(notFound.status === 404, `PATCH inconnu → ${notFound.status}`);

    // suppression refusée tant que des produits l'utilisent
    const used = await api('DELETE', `/api/categories/${catId}`, { token: state.tokenA });
    assert(used.status === 409, `DELETE utilisée → ${used.status} (attendu 409)`);
    const delProd = await api('DELETE', `/api/products/${prodId}`, { token: state.tokenA });
    assert(delProd.status === 204, `DELETE product → ${delProd.status}`);
    const delCat = await api('DELETE', `/api/categories/${catId}`, { token: state.tokenA });
    assert(delCat.status === 204, `DELETE catégorie → ${delCat.status}`);
    const again = await api('DELETE', `/api/categories/${catId}`, { token: state.tokenA });
    assert(again.status === 404, `2e DELETE → ${again.status} (attendu 404)`);
  });

  await step('GET /api/finances/summary (revenus, coûts, marge) + 403 client', async () => {
    const forbidden = await api('GET', '/api/finances/summary', { token: state.tokenB });
    assert(forbidden.status === 403, `client → ${forbidden.status} (attendu 403)`);
    const r = await api('GET', '/api/finances/summary', { token: state.tokenA });
    assert(r.status === 200, `status ${r.status} ${r.text}`);
    const s = r.json;
    // la commande livrée à l'étape précédente est journalisée
    assert(s.revenueCents >= state.order.totalCents, `revenue ${s.revenueCents} < commande ${state.order.totalCents}`);
    assert(s.orders >= 1, `orders = ${s.orders}`);
    // coût figé : 350 × 2 (produit 1) + 0 × 1 (produit 2)
    assert(s.costCents >= 700, `costCents = ${s.costCents} (attendu ≥ 700)`);
    assert(s.grossMarginCents === s.revenueCents - s.costCents, 'marge brute incohérente');
    assert(s.netCents === s.grossMarginCents - s.expensesCents, 'résultat net incohérent');
    assert(s.units >= 3, `units = ${s.units}`);
    const bad = await api('GET', '/api/finances/summary?from=18-11-2026', { token: state.tokenA });
    assert(bad.status === 400, `from invalide → ${bad.status} (attendu 400)`);
  });

  await step('GET /api/finances/sales + /products (journal figé à la livraison)', async () => {
    const r = await api('GET', '/api/finances/sales', { token: state.tokenA });
    assert(r.status === 200, `status ${r.status}`);
    const sale = r.json.sales.find((x) => x.orderId === state.order.id);
    assert(sale, 'vente de la commande absente du journal');
    assert(sale.totalCents === state.order.totalCents, 'totalCents KO');
    assert(sale.items.length === 2, `items = ${sale.items.length}`);
    const item1 = sale.items.find((i) => i.productId === state.products[0].id);
    assert(item1 && item1.costCents === 350, `cost_cents figé = ${item1 && item1.costCents}`);
    const item2 = sale.items.find((i) => i.productId === state.products[1].id);
    assert(item2 && item2.costCents === 0, `cost item2 = ${item2 && item2.costCents}`);

    const prods = await api('GET', '/api/finances/products', { token: state.tokenA });
    assert(prods.status === 200, `products → ${prods.status}`);
    const row = prods.json.products.find((p) => p.productId === state.products[0].id);
    assert(row, 'produit absent du détail finances');
    assert(row.units >= 2, `units = ${row.units}`);
    assert(row.marginCents === row.revenueCents - row.costCents, 'marge produit incohérente');
  });

  await step('CRUD /api/finances/expenses (dépense manuelle)', async () => {
    const stamp = Date.now().toString(36);
    const bad = await api('POST', '/api/finances/expenses', {
      token: state.tokenA,
      body: { label: '', amountCents: -1 },
    });
    assert(bad.status === 400, `invalides → ${bad.status} (attendu 400)`);
    const created = await api('POST', '/api/finances/expenses', {
      token: state.tokenA,
      body: { label: `Loyer ${stamp}`, amountCents: 15000 },
    });
    assert(created.status === 201, `POST → ${created.status} ${created.text}`);
    assert(created.json.amountCents === 15000 && created.json.date, 'shape dépense KO');
    state.expenseId = created.json.id;

    const patched = await api('PATCH', `/api/finances/expenses/${created.json.id}`, {
      token: state.tokenA,
      body: { amountCents: 12000 },
    });
    assert(patched.status === 200 && patched.json.amountCents === 12000, 'PATCH KO');

    const sum = await api('GET', '/api/finances/summary', { token: state.tokenA });
    assert(sum.json.expensesCents >= 12000, `expensesCents = ${sum.json.expensesCents}`);
    assert(sum.json.netCents === sum.json.grossMarginCents - sum.json.expensesCents, 'net KO après dépense');

    const forbidden = await api('DELETE', `/api/finances/expenses/${created.json.id}`, {
      token: state.tokenB,
    });
    assert(forbidden.status === 403, `DELETE client → ${forbidden.status}`);
    const del = await api('DELETE', `/api/finances/expenses/${created.json.id}`, { token: state.tokenA });
    assert(del.status === 204, `DELETE → ${del.status}`);
    const del2 = await api('DELETE', `/api/finances/expenses/${created.json.id}`, { token: state.tokenA });
    assert(del2.status === 404, `2e DELETE → ${del2.status} (attendu 404)`);
    state.expenseId = null;
  });

  await step('GET /api/conversations (client vérifié crée, supplier liste)', async () => {
    const asClient = await api('GET', '/api/conversations', { token: state.tokenGH });
    assert(asClient.status === 200, `client status ${asClient.status}`);
    assert(asClient.json.conversations.length === 1, 'client != 1 conversation');
    const conv = asClient.json.conversations[0];
    assert(conv.customer.id === state.userGH.id, 'customer != client');
    assert(conv.lastMessage === null && conv.unreadCount === 0, 'init lastMessage/unread KO');
    const asSupplier = await api('GET', '/api/conversations', { token: state.tokenA });
    assert(asSupplier.status === 200, `supplier status ${asSupplier.status}`);
    const listed = asSupplier.json.conversations.find((c) => c.id === conv.id);
    assert(listed, 'conversation absente côté supplier');
    assert(listed.customer.id === state.userGH.id, 'customer côté supplier KO');
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
    const sockGuest = await connectSocket(state.tokenB);
    const ackGuest = await joinConversation(sockGuest, state.guestConvId);
    assert(ackGuest && ackGuest.status === 'joined', `ack démo = ${JSON.stringify(ackGuest)}`);
    sockGuest.close();
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
    const unread = await api('GET', '/api/conversations', { token: state.tokenGH });
    assert(unread.json.conversations[0].unreadCount === 1, 'unreadCount != 1');
    const read = await api('POST', `/api/conversations/${state.conv.id}/read`, { token: state.tokenGH });
    assert(read.status === 204, `read → ${read.status}`);
    const after = await api('GET', '/api/conversations', { token: state.tokenGH });
    assert(after.json.conversations[0].unreadCount === 0, 'unreadCount != 0 après read');
    assert(after.json.conversations[0].lastMessage.id === state.message.id, 'lastMessage KO');
  });

  await step('OAuth sans clés : redirect not_configured (pas de 500)', async () => {
    const start = await api('GET', '/api/auth/start?provider=github', { redirect: 'manual' });
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

  await step('Purge 2 h : commande terminée supprimée, chat si plus rien en cours', async () => {
    const stamp = Date.now().toString(36);
    const old = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    const mkUser = (suffix) => {
      const info = db
        .prepare(
          "INSERT INTO users (provider, provider_id, name, email, avatar_url, role, created_at) " +
            "VALUES ('github', ?, ?, NULL, NULL, 'customer', ?)",
        )
        .run(suffix, `Smoke Purge ${suffix}`, new Date().toISOString());
      return db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    };
    const mkOrder = (userId, status) =>
      db
        .prepare(
          "INSERT INTO orders (user_id, status, total_cents, address, phone, note, created_at, updated_at) " +
            "VALUES (?, ?, 1000, '1 rue du Test', '0611111111', '', ?, ?)",
        )
        .run(userId, status, old, old).lastInsertRowid;
    const mkConv = (userId) =>
      db
        .prepare(
          'INSERT INTO conversations (customer_id, supplier_id, created_at, updated_at) VALUES (?, NULL, ?, ?)',
        )
        .run(userId, old, old).lastInsertRowid;

    // Cas 1 : client dont TOUTES les commandes sont terminées → commande + chat purgés
    const u1 = mkUser(`purge-a-${stamp}`);
    const done1 = mkOrder(u1.id, 'delivered');
    const conv1 = mkConv(u1.id);
    db.prepare(
      'INSERT INTO messages (conversation_id, sender_id, body, created_at, read_at) VALUES (?, ?, ?, ?, NULL)',
    ).run(conv1, u1.id, 'Message de test', old);

    // Cas 2 : client avec une commande terminée ET une commande en cours → seul l'historique part
    const u2 = mkUser(`purge-b-${stamp}`);
    const done2 = mkOrder(u2.id, 'refused');
    const active = mkOrder(u2.id, 'pending');
    const conv2 = mkConv(u2.id);

    purgeCompletedOrders();

    assert(!db.prepare('SELECT 1 AS x FROM orders WHERE id = ?').get(done1), 'commande livrée non purgée');
    assert(!db.prepare('SELECT 1 AS x FROM orders WHERE id = ?').get(done2), 'commande refusée non purgée');
    assert(db.prepare('SELECT 1 AS x FROM orders WHERE id = ?').get(active), 'commande en cours purgée par erreur');
    assert(
      !db.prepare('SELECT 1 AS x FROM conversations WHERE id = ?').get(conv1),
      'chat non purgé alors que plus aucune commande en cours',
    );
    assert(
      !db.prepare('SELECT 1 AS x FROM messages WHERE conversation_id = ?').get(conv1),
      'messages non supprimés en cascade',
    );
    assert(
      db.prepare('SELECT 1 AS x FROM conversations WHERE id = ?').get(conv2),
      'chat supprimé alors que le client a une commande en cours',
    );

    // nettoyage des restes du test
    db.prepare('DELETE FROM conversations WHERE id = ?').run(conv2);
    db.prepare('DELETE FROM orders WHERE id = ?').run(active);
  });

  await step('Journal des ventes : survit à la purge de 2 h', async () => {
    const sale = db.prepare('SELECT * FROM sales WHERE order_id = ?').get(state.order.id);
    assert(sale, 'vente non journalisée à la livraison');
    // la commande devient « vieille » → la purge doit la supprimer…
    const old = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    db.prepare('UPDATE orders SET created_at = ?, updated_at = ? WHERE id = ?').run(
      old,
      old,
      state.order.id,
    );
    db.prepare('UPDATE sales SET delivered_at = ? WHERE order_id = ?').run(old, state.order.id);
    const before = db.prepare('SELECT COUNT(*) AS n FROM sales').get().n;
    purgeCompletedOrders();
    // …mais la vente reste : c'est le livre de comptes du fournisseur.
    assert(
      !db.prepare('SELECT 1 AS x FROM orders WHERE id = ?').get(state.order.id),
      'commande purgée attendue',
    );
    const after = db.prepare('SELECT * FROM sales WHERE order_id = ?').get(state.order.id);
    assert(after, 'vente perdue pendant la purge !');
    const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(after.id);
    assert(items.length === 2, `sale_items = ${items.length} (attendu 2)`);
    assert(db.prepare('SELECT COUNT(*) AS n FROM sales').get().n === before, 'nb de ventes modifié');
    // remise à zéro des données de test (prod propre)
    db.prepare('DELETE FROM sales WHERE order_id = ?').run(state.order.id);
    db.prepare('UPDATE products SET cost_cents = ? WHERE id = ?').run(
      state.origCost ?? 0,
      state.products[0].id,
    );
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
