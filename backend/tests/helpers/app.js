import { createApp } from '../../src/app.js';
import { seed } from '../../src/seed/index.js';
import { prismaTest, viderBase } from './db.js';

/** Base de test propre + données de départ + application Express branchée dessus. */
export async function creerContexte() {
  const prisma = prismaTest();
  await viderBase(prisma);
  await seed(prisma);
  return { prisma, app: createApp({ prisma, corsOrigin: 'http://localhost:5173' }) };
}

/** Nouvelle app (donc nouveaux compteurs de limitation) sur la même base. */
export function nouvelleApp(prisma) {
  return createApp({ prisma, corsOrigin: 'http://localhost:5173' });
}
