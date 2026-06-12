import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { Server } from 'socket.io';
import authRoutes from './routes/auth';
import clientAuthRoutes from './routes/clientAuth';
import uploadRoutes from './routes/upload';
import conversationRoutes from './routes/conversations';
import { setupSocket } from './socket';

const app = express();
const server = http.createServer(app);

const ORIGIN = process.env.CORS_ORIGIN || '*';

app.use(cors({ origin: ORIGIN }));
app.use(express.json({ limit: '5mb' }));

// Serve encrypted file blobs (still encrypted - safe to serve publicly)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/client-auth', clientAuthRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/conversations', conversationRoutes);

app.get('/health', (_req, res) => res.json({ ok: true }));

const io = new Server(server, {
  cors: { origin: ORIGIN },
  maxHttpBufferSize: 25 * 1024 * 1024,
});

setupSocket(io);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`GhostLine server running on port ${PORT}`);
});
