import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';

const router = Router();

// Register a new client account
router.post('/register', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 characters' });
  }

  const existing = await prisma.clientAccount.findUnique({ where: { username } });
  if (existing) return res.status(409).json({ error: 'Username taken' });

  const passwordHash = await bcrypt.hash(password, 12);
  const account = await prisma.clientAccount.create({
    data: { username, passwordHash },
    select: { id: true, username: true },
  });

  const token = jwt.sign({ clientAccountId: account.id }, process.env.JWT_SECRET!, {
    expiresIn: '90d',
  });
  return res.json({ token, account });
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }

  const account = await prisma.clientAccount.findUnique({ where: { username } });
  if (!account) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, account.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ clientAccountId: account.id }, process.env.JWT_SECRET!, {
    expiresIn: '90d',
  });
  return res.json({ token, account: { id: account.id, username: account.username } });
});

export default router;
