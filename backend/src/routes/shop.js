import { Router } from 'express';
import { shopStatus, setShopClosedUntil } from '../db.js';
import { requireAuth, requireSupplier } from '../auth.js';
import { getIO } from '../sockets.js';

const router = Router();

/** Diffuse le nouvel état à tous les clients connectés (sockets authentifiées). */
function broadcast(status) {
  getIO()?.emit('shop:changed', status);
  return status;
}

/** GET /api/shop/status — public, utilisé par le web et les apps natives. */
router.get('/status', (_req, res) => {
  res.json(shopStatus());
});

/**
 * POST /api/shop/close — fournisseur uniquement.
 * Body : { reopensAt: ISO } — date/heure de réouverture, dans le futur.
 */
router.post('/close', requireAuth, requireSupplier, (req, res) => {
  const raw = req.body && typeof req.body === 'object' ? req.body.reopensAt : undefined;
  const ts = typeof raw === 'string' ? Date.parse(raw) : NaN;
  const max = Date.now() + 365 * 24 * 3600 * 1000;
  if (!Number.isFinite(ts) || ts <= Date.now()) {
    return res.status(400).json({ error: 'reopensAt: date et heure de réouverture dans le futur requises' });
  }
  if (ts > max) {
    return res.status(400).json({ error: 'reopensAt: la réouverture doit avoir lieu dans les 365 jours' });
  }
  return res.json(broadcast(setShopClosedUntil(new Date(ts).toISOString())));
});

/** POST /api/shop/open — fournisseur uniquement, réouverture immédiate. */
router.post('/open', requireAuth, requireSupplier, (_req, res) => {
  return res.json(broadcast(setShopClosedUntil(null)));
});

export default router;
