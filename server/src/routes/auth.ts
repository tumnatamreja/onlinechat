import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// Register operator (only usable if no operators exist, or by authenticated operator)
router.post('/register', async (req: Request, res: Response) => {
  const { username, password, publicKey } = req.body;

  if (!username || !password || !publicKey) {
    return res.status(400).json({ error: 'username, password, publicKey required' });
  }

  const count = await prisma.operator.count();
  if (count > 0) {
    // Require auth token to add more operators
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(403).json({ error: 'Only existing operators can add new operators' });
    }
    try {
      jwt.verify(header.slice(7), process.env.JWT_SECRET!);
    } catch {
      return res.status(403).json({ error: 'Invalid token' });
    }
  }

  const existing = await prisma.operator.findUnique({ where: { username } });
  if (existing) return res.status(409).json({ error: 'Username taken' });

  const passwordHash = await bcrypt.hash(password, 12);
  const operator = await prisma.operator.create({
    data: { username, passwordHash, publicKey },
    select: { id: true, username: true, publicKey: true },
  });

  const token = jwt.sign({ id: operator.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });
  return res.json({ operator, token });
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }

  const operator = await prisma.operator.findUnique({ where: { username } });
  if (!operator) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, operator.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ id: operator.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });
  return res.json({
    token,
    operator: { id: operator.id, username: operator.username, publicKey: operator.publicKey },
  });
});

// Get current operator
router.get('/me', authMiddleware, (req: AuthRequest, res: Response) => {
  return res.json({ operator: req.operator });
});

// Update public key (when operator regenerates keypair)
router.put('/keypair', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { publicKey } = req.body;
  if (!publicKey) return res.status(400).json({ error: 'publicKey required' });

  await prisma.operator.update({
    where: { id: req.operator!.id },
    data: { publicKey },
  });
  return res.json({ ok: true });
});

export default router;
