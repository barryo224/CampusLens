import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.ts';

/**
 * Crée un client Prisma relié à PostgreSQL.
 * Toutes les requêtes passent par Prisma : aucune SQL écrite à la main,
 * donc pas d'injection SQL possible.
 */
export function creerPrisma(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL n'est pas définie (voir .env.example).");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}
