import { db } from './db.js';
import { getIO } from './sockets.js';

/**
 * Purge automatique des commandes terminées.
 *
 * Une commande « delivered » ou « refused » est supprimée (articles compris, en cascade)
 * RETENTION_HOURS après son dernier changement de statut. Le chat du client n'est supprimé
 * que s'il ne lui reste plus aucune commande en cours (on ne casse pas un fil encore utile).
 *
 * Variables : ORDER_RETENTION_HOURS (défaut 2), ORDER_PURGE_INTERVAL_S (défaut 60).
 */

const hours = Number(process.env.ORDER_RETENTION_HOURS);
const seconds = Number(process.env.ORDER_PURGE_INTERVAL_S);

export const RETENTION_HOURS = Number.isFinite(hours) && hours > 0 ? hours : 2;
const INTERVAL_MS = (Number.isFinite(seconds) && seconds > 0 ? seconds : 60) * 1000;

const TERMINAL = "('delivered', 'refused')";

/** Effectue une passe de purge. Retourne les IDs supprimés (utilisable en test). */
export function purgeCompletedOrders() {
  const cutoff = new Date(Date.now() - RETENTION_HOURS * 3600 * 1000).toISOString();
  const stale = db
    .prepare(`SELECT * FROM orders WHERE status IN ${TERMINAL} AND updated_at <= ?`)
    .all(cutoff);
  if (stale.length === 0) return { orders: [], conversations: [] };

  const hasActive = db.prepare(
    `SELECT 1 AS x FROM orders WHERE user_id = ? AND status NOT IN ${TERMINAL} LIMIT 1`,
  );
  const findConv = db.prepare('SELECT id FROM conversations WHERE customer_id = ?');
  const deleteOrder = db.prepare('DELETE FROM orders WHERE id = ?');
  const deleteConv = db.prepare('DELETE FROM conversations WHERE id = ?');

  const removedOrders = [];
  const removedConversations = [];

  db.transaction(() => {
    for (const order of stale) {
      deleteOrder.run(order.id); // order_items : ON DELETE CASCADE
      removedOrders.push(order);
      // Le client n'a plus rien d'actif → son fil de discussion part aussi (messages en cascade).
      if (!hasActive.get(order.user_id)) {
        const conv = findConv.get(order.user_id);
        if (conv) {
          deleteConv.run(conv.id);
          removedConversations.push({ ...conv, customerId: order.user_id });
        }
      }
    }
  })();

  const io = getIO();
  for (const order of removedOrders) {
    io?.to('admin').emit('order:deleted', { id: order.id, customerId: order.user_id });
    io?.to(`user:${order.user_id}`).emit('order:deleted', {
      id: order.id,
      customerId: order.user_id,
      mine: true,
    });
  }
  for (const conv of removedConversations) {
    io?.to('admin').emit('conversation:deleted', { conversationId: conv.id });
    io?.to(`conv:${conv.id}`).emit('conversation:deleted', { conversationId: conv.id });
    io?.to(`user:${conv.customerId}`).emit('conversation:deleted', { conversationId: conv.id });
  }

  if (removedOrders.length > 0) {
    console.log(
      `[cleanup] purge : ${removedOrders.length} commande(s) > ${RETENTION_HOURS}h` +
        (removedConversations.length ? `, ${removedConversations.length} conversation(s)` : ''),
    );
  }
  return {
    orders: removedOrders.map((o) => o.id),
    conversations: removedConversations.map((c) => c.id),
  };
}

let timer = null;

/** Démarre la boucle de purge (idempotent). */
export function startCleanup() {
  if (timer) return;
  const tick = () => {
    try {
      purgeCompletedOrders();
    } catch (err) {
      console.error('[cleanup] erreur :', err && err.message);
    }
  };
  timer = setInterval(tick, INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
  setTimeout(tick, 3000).unref?.();
}
