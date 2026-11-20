import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { db, ensureReady } from './db.js';
import { seedIfEmpty } from './seed.js';
import { initSockets, getIO } from './sockets.js';
import authRoutes from './routes/auth.js';
import accountRoutes from './routes/account.js';
import adminRoutes from './routes/admin.js';
import productRoutes from './routes/products.js';
import formuleRoutes from './routes/formules.js';
import categoryRoutes from './routes/categories.js';
import financeRoutes from './routes/finances.js';
import orderRoutes from './routes/orders.js';
import conversationRoutes from './routes/conversations.js';
import uploadRoutes, { UPLOAD_DIR } from './routes/uploads.js';
import { startCleanup } from './cleanup.js';

const PORT = Number(process.env.PORT || 3000);
const VERSION = '1.0.0';

/** UI web (client Windows / navigateur) : backend/../web */
const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web');

ensureReady();
const seeded = seedIfEmpty();

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Journal console : timestamp pour chaque requête API
app.use('/api', (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    // Le jeton de liaison OAuth transite dans l'URL : ne jamais le journaliser.
    const safeUrl = req.originalUrl.replace(/([?&]token=)[^&]*/gi, '$1[redacted]');
    console.log(
      `${new Date().toISOString()} ${req.method} ${safeUrl} ${res.statusCode} (${Date.now() - start}ms)`
    );
  });
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: VERSION });
});

app.use('/api/auth', authRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/products', productRoutes);
app.use('/api/formules', formuleRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/finances', financeRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/uploads', uploadRoutes);

// Photos produit téléchargées par le fournisseur (5 Mo max, images uniquement).
app.use(
  '/uploads',
  express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true, fallthrough: false }),
);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Route introuvable' });
});

// UI web (app Windows / navigateur) : servie sous /app pour ne pas exposer
// la boutique sur la racine du site (chorizo.dpdns.org/ = page API).
app.use(express.static(WEB_DIR, { index: false, maxAge: '5m' }));
app.get('/app', (_req, res) => res.sendFile(path.join(WEB_DIR, 'index.html')));
app.get('/app/*', (_req, res) => res.sendFile(path.join(WEB_DIR, 'index.html')));

// Racine : page d'information (pas de boutique).
app.get('/', (_req, res) => {
  res.type('html').send(
    '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>ShopTaBouffe</title></head>' +
    '<body style="font-family:sans-serif;padding:40px;color:#222"><h1>ShopTaBouffe</h1>' +
    '<p>API backend. L\'application mobile / Windows se connecte via cette URL.</p>' +
    '<p><a href="/app">Ouvrir l\'app web</a> · <a href="/api/health">Health</a></p></body></html>',
  );
});

// Erreurs → JSON
app.use((err, _req, res, _next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON invalide' });
  }
  console.error('[server] erreur:', err);
  return res.status(500).json({ error: 'Erreur serveur' });
});

const server = http.createServer(app);
initSockets(server);
app.set('io', getIO());

server.listen(PORT, () => {
  console.log(`[server] Delivro API v${VERSION} — http://localhost:${PORT}/api (seed: ${seeded} produits)`);
  startCleanup();
});

function shutdown(signal) {
  console.log(`[server] ${signal} — arrêt…`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
