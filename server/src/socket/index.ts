import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { notifyTelegram, DEPARTMENT_LABELS } from '../lib/telegram';

export function setupSocket(io: Server) {
  let operatorsOnline = 0;

  // ─── OPERATOR NAMESPACE ───────────────────────────────────────────────────
  const opNs = io.of('/operator');

  opNs.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('AUTH_REQUIRED'));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
      const op = await prisma.operator.findUnique({ where: { id: payload.id } });
      if (!op) return next(new Error('AUTH_REQUIRED'));
      socket.data.operator = op;
      next();
    } catch {
      next(new Error('AUTH_REQUIRED'));
    }
  });

  opNs.on('connection', async (socket: Socket) => {
    const op = socket.data.operator;
    socket.join('operators');
    console.log(`[OP] ${op.username} connected`);

    // ── Operator presence ────────────────────────────────────────────────
    operatorsOnline++;
    io.of('/client').emit('server:operator_status', { online: operatorsOnline > 0 });

    // Send all open conversations
    const convs = await prisma.conversation.findMany({
      where: { status: { in: ['WAITING', 'ACTIVE'] } },
      include: {
        messages: { orderBy: { timestamp: 'desc' }, take: 1 },
        operator: { select: { username: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    socket.emit('server:conversations', convs);

    // ─── Claim a waiting conversation ──────────────────────────────────────
    socket.on('operator:claim', async ({ conversationId }: { conversationId: string }) => {
      const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
      if (!conv || conv.status !== 'WAITING') {
        return socket.emit('server:error', { message: 'Conversation no longer available' });
      }

      await prisma.conversation.update({
        where: { id: conversationId },
        data: { status: 'ACTIVE', operatorId: op.id },
      });

      socket.join(`conv:${conversationId}`);

      // Load full history for operator
      const messages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { timestamp: 'asc' },
      });
      socket.emit('server:history', { conversationId, messages });

      // Tell client: operator joined + send operator's public key
      io.of('/client').to(`conv:${conversationId}`).emit('server:operator_joined', {
        operatorPublicKey: op.publicKey,
      });

      // Tell all operators: this conv is taken
      opNs.to('operators').emit('server:conversation_claimed', {
        conversationId,
        operatorUsername: op.username,
      });
    });

    // ─── Operator sends encrypted message ──────────────────────────────────
    socket.on(
      'operator:message',
      async ({
        conversationId,
        encryptedContent,
        nonce,
      }: {
        conversationId: string;
        encryptedContent: string;
        nonce: string;
      }) => {
        const msg = await prisma.message.create({
          data: { conversationId, senderType: 'OPERATOR', encryptedContent, nonce },
        });

        io.of('/client').to(`conv:${conversationId}`).emit('server:message', msg);
        opNs.to(`conv:${conversationId}`).except(socket.id).emit('server:message', msg);
        socket.emit('server:message_sent', msg);
      }
    );

    // ─── Operator sends file message ───────────────────────────────────────
    socket.on(
      'operator:file',
      async ({
        conversationId,
        encryptedContent,
        nonce,
        fileUrl,
        fileName,
        fileMime,
      }: {
        conversationId: string;
        encryptedContent: string;
        nonce: string;
        fileUrl: string;
        fileName: string;
        fileMime: string;
      }) => {
        const msg = await prisma.message.create({
          data: {
            conversationId,
            senderType: 'OPERATOR',
            encryptedContent,
            nonce,
            fileUrl,
            fileName,
            fileMime,
          },
        });

        io.of('/client').to(`conv:${conversationId}`).emit('server:message', msg);
        opNs.to(`conv:${conversationId}`).except(socket.id).emit('server:message', msg);
        socket.emit('server:message_sent', msg);
      }
    );

    // ─── Typing indicator ──────────────────────────────────────────────────
    socket.on(
      'operator:typing',
      ({ conversationId, typing }: { conversationId: string; typing: boolean }) => {
        io.of('/client').to(`conv:${conversationId}`).emit('server:typing', { typing });
      }
    );

    // ─── Close conversation ────────────────────────────────────────────────
    socket.on('operator:close', async ({ conversationId }: { conversationId: string }) => {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { status: 'CLOSED' },
      });
      io.of('/client').to(`conv:${conversationId}`).emit('server:closed');
      opNs.to('operators').emit('server:conversation_closed', { conversationId });
    });

    socket.on('disconnect', () => {
      operatorsOnline = Math.max(0, operatorsOnline - 1);
      io.of('/client').emit('server:operator_status', { online: operatorsOnline > 0 });
      console.log(`[OP] ${op.username} disconnected`);
    });
  });

  // ─── CLIENT NAMESPACE ─────────────────────────────────────────────────────
  const clientNs = io.of('/client');

  clientNs.on('connection', (socket: Socket) => {
    console.log(`[CLIENT] connected ${socket.id}`);

    // Tell the freshly-connected client whether anyone is around right now
    socket.emit('server:operator_status', { online: operatorsOnline > 0 });

    // ─── Client initiates chat (requires account token) ───────────────────
    socket.on(
      'client:join',
      async ({
        token,
        clientPublicKey,
        department,
        label,
      }: {
        token: string;
        clientPublicKey: string;
        department?: 'SUPPORT' | 'ORDERS' | 'OTHER';
        label?: string;
      }) => {
        let clientAccountId: string;
        try {
          const payload = jwt.verify(token, process.env.JWT_SECRET!) as { clientAccountId: string };
          clientAccountId = payload.clientAccountId;
        } catch {
          return socket.emit('server:error', { message: 'AUTH_REQUIRED' });
        }

        const account = await prisma.clientAccount.findUnique({ where: { id: clientAccountId } });
        if (!account) return socket.emit('server:error', { message: 'AUTH_REQUIRED' });

        let conv = await prisma.conversation.findFirst({
          where: { clientAccountId, status: { not: 'CLOSED' } },
          orderBy: { createdAt: 'desc' },
        });

        let isNew = false;
        if (!conv) {
          conv = await prisma.conversation.create({
            data: {
              clientAccountId,
              clientPublicKey,
              clientLabel: account.username,
              department: department || 'OTHER',
              status: 'WAITING',
            },
          });
          isNew = true;
        } else {
          const updates: { clientPublicKey?: string; clientLabel?: string } = {};
          if (conv.clientPublicKey !== clientPublicKey) {
            // Client reconnected from a different device/browser — refresh the
            // public key on file. Note: this means messages encrypted to the
            // old key become undecryptable going forward (see README caveat).
            updates.clientPublicKey = clientPublicKey;
          }
          if (conv.clientLabel !== account.username) {
            updates.clientLabel = account.username;
          }
          if (Object.keys(updates).length > 0) {
            conv = await prisma.conversation.update({ where: { id: conv.id }, data: updates });
          }
        }

        socket.join(`conv:${conv.id}`);
        socket.data.conversationId = conv.id;

        // Resolve which operator's public key the client should encrypt to.
        // If a specific operator has already claimed this conversation, use
        // theirs. Otherwise fall back to the team's default (oldest/first)
        // operator account — this is what lets a client start writing
        // immediately, Telegram-style, without waiting for someone to claim
        // the chat first. (For a single shared support account this is
        // exactly right; with multiple independent operators, only the
        // default operator's secret key can decrypt unclaimed chats until
        // they're claimed.)
        const targetOperator = conv.operatorId
          ? await prisma.operator.findUnique({ where: { id: conv.operatorId } })
          : await prisma.operator.findFirst({ orderBy: { createdAt: 'asc' } });
        const operatorPublicKey = targetOperator?.publicKey ?? null;

        socket.emit('server:joined', {
          conversationId: conv.id,
          status: conv.status,
          department: conv.department,
          operatorPublicKey,
        });

        // Always send existing history on (re)join — not just when ACTIVE —
        // so a returning client sees their prior messages immediately.
        const messages = await prisma.message.findMany({
          where: { conversationId: conv.id },
          orderBy: { timestamp: 'asc' },
        });
        socket.emit('server:history', { conversationId: conv.id, messages });

        if (isNew) {
          const deptLabel = DEPARTMENT_LABELS[conv.department] || conv.department;
          opNs.to('operators').emit('server:new_conversation', {
            id: conv.id,
            clientPublicKey,
            clientLabel: conv.clientLabel,
            department: conv.department,
            createdAt: conv.createdAt,
          });
          notifyTelegram(
            `🔔 Нов разговор\nКлиент: ${conv.clientLabel}\nОтдел: ${deptLabel}\n\nОтвори операторската конзола, за да отговориш.`
          );
        }
      }
    );

    // ─── Client sends encrypted message ───────────────────────────────────
    socket.on(
      'client:message',
      async ({
        encryptedContent,
        nonce,
      }: {
        encryptedContent: string;
        nonce: string;
      }) => {
        const conversationId = socket.data.conversationId;
        if (!conversationId) return;

        const msg = await prisma.message.create({
          data: { conversationId, senderType: 'CLIENT', encryptedContent, nonce },
        });

        opNs.to(`conv:${conversationId}`).emit('server:message', msg);
        socket.emit('server:message', msg);

        // Notify admins if nobody has claimed this conversation yet
        const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
        if (conv && conv.status === 'WAITING') {
          const deptLabel = DEPARTMENT_LABELS[conv.department] || conv.department;
          notifyTelegram(
            `💬 Ново съобщение (чака оператор)\nКлиент: ${conv.clientLabel}\nОтдел: ${deptLabel}`
          );
        }
      }
    );

    // ─── Client sends file ─────────────────────────────────────────────────
    socket.on(
      'client:file',
      async ({
        encryptedContent,
        nonce,
        fileUrl,
        fileName,
        fileMime,
      }: {
        encryptedContent: string;
        nonce: string;
        fileUrl: string;
        fileName: string;
        fileMime: string;
      }) => {
        const conversationId = socket.data.conversationId;
        if (!conversationId) return;

        const msg = await prisma.message.create({
          data: {
            conversationId,
            senderType: 'CLIENT',
            encryptedContent,
            nonce,
            fileUrl,
            fileName,
            fileMime,
          },
        });

        opNs.to(`conv:${conversationId}`).emit('server:message', msg);
        socket.emit('server:message', msg);
      }
    );

    // ─── Typing ────────────────────────────────────────────────────────────
    socket.on('client:typing', ({ typing }: { typing: boolean }) => {
      const conversationId = socket.data.conversationId;
      if (!conversationId) return;
      opNs.to(`conv:${conversationId}`).emit('server:client_typing', { typing });
    });

    socket.on('disconnect', () => {
      console.log(`[CLIENT] disconnected ${socket.id}`);
    });
  });
}
