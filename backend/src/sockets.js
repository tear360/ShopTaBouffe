import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { db } from './db.js';
import { getJwtSecret } from './auth.js';

let io = null;

export function getIO() {
  return io;
}

export function initSockets(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  // Handshake : auth: { token } — rejet si token invalide (connect_error data.code = 401)
  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    try {
      if (!token || typeof token !== 'string') throw new Error('missing token');
      const payload = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
      if (!user) throw new Error('unknown user');
      socket.data.user = user;
      next();
    } catch {
      const err = new Error('unauthorized');
      err.data = { code: 401 };
      next(err);
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    socket.join(`user:${user.id}`);
    if (user.role === 'supplier') socket.join('admin');

    // Client : conversation:join { conversationId } → vérifie participation → room conv:<id>
    socket.on('conversation:join', (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const conversationId = payload ? Number(payload.conversationId) : NaN;
      const conv = Number.isInteger(conversationId)
        ? db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId)
        : null;
      // Client : son propre fil. Fournisseur : tous les fils (compte admin).
      const participant = conv && (conv.customer_id === user.id || user.role === 'supplier');
      if (!participant) return reply({ status: 'error', error: 'not_participant' });
      socket.join(`conv:${conversationId}`);
      return reply({ status: 'joined', conversationId });
    });

    // Supplier : watch:orders → join room admin (idempotent)
    socket.on('watch:orders', (_payload, ack) => {
      if (user.role === 'supplier') socket.join('admin');
      if (typeof ack === 'function') ack({ status: 'joined' });
    });
  });

  return io;
}
