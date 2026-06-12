import 'dotenv/config';
import bcrypt from 'bcryptjs';
import prisma from './lib/prisma';

async function main() {
  const username = process.argv[2];
  const password = process.argv[3];
  const publicKey = process.argv[4];

  if (!username || !password || !publicKey) {
    console.error('Usage: ts-node src/seed.ts <username> <password> <publicKeyBase64>');
    console.error('Generate a keypair first using the operator panel "Generate Keys" page,');
    console.error('then paste the public key here to create the first operator account.');
    process.exit(1);
  }

  const existing = await prisma.operator.findUnique({ where: { username } });
  if (existing) {
    console.log('Operator already exists.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const op = await prisma.operator.create({
    data: { username, passwordHash, publicKey },
  });

  console.log('Created operator:', op.username, op.id);
}

main()
  .catch(console.error)
  .finally(() => process.exit());
