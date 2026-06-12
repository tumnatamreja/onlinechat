import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  const conv = await prisma.conversation.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      clientPublicKey: true,
      clientLabel: true,
      department: true,
      status: true,
      operatorId: true,
      createdAt: true,
    },
  });
  if (!conv) return res.status(404).json({ error: 'Not found' });
  return res.json(conv);
});

export default router;
