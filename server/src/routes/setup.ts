import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';

const router = Router();

/**
 * POST /api/setup
 * Creates the first operator account. Works ONLY if no operators exist yet.
 * Uses Node's built-in crypto to generate X25519 keypair (compatible with TweetNaCl box).
 */
router.post('/', async (req: Request, res: Response) => {
  const count = await prisma.operator.count();
  if (count > 0) {
    return res.status(403).json({ error: 'Setup already completed. Operators exist.' });
  }

  const { username = 'admin', password = 'admin123' } = req.body;

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  // Generate X25519 keypair via Node crypto (raw bytes == TweetNaCl box compatible)
  const { privateKey: privObj, publicKey: pubObj } =
    crypto.generateKeyPairSync('x25519');

  const privJwk = privObj.export({ format: 'jwk' }) as { d: string };
  const pubJwk  = pubObj.export({ format: 'jwk' })  as { x: string };

  // JWK uses base64url — convert to standard base64 (TweetNaCl encodeBase64 format)
  const toBase64 = (b64url: string) =>
    Buffer.from(b64url, 'base64url').toString('base64');

  const publicKeyB64 = toBase64(pubJwk.x);
  const secretKeyB64 = toBase64(privJwk.d);

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.operator.create({
    data: { username, passwordHash, publicKey: publicKeyB64 },
  });

  return res.json({
    ok: true,
    username,
    password,
    publicKey: publicKeyB64,
    secretKey: secretKeyB64,
    browserStep: `Paste this in F12 → Console on the operator page:\n\nlocalStorage.setItem('ghostline_operator_keypair', JSON.stringify({publicKey:"${publicKeyB64}",secretKey:"${secretKeyB64}"}))`,
  });
});

export default router;
