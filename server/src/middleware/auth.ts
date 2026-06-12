import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';

export interface AuthRequest extends Request {
  operator?: { id: string; username: string; publicKey: string };
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
    const operator = await prisma.operator.findUnique({
      where: { id: payload.id },
      select: { id: true, username: true, publicKey: true },
    });
    if (!operator) return res.status(401).json({ error: 'Unauthorized' });
    req.operator = operator;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
