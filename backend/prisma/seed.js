import { creerPrisma } from '../src/db.js';
import { seed } from '../src/seed/index.js';

const prisma = creerPrisma();
try {
  await seed(prisma);
  console.log('Seed terminé.');
} finally {
  await prisma.$disconnect();
}
