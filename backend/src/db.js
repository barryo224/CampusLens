import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.ts';

/**
 * Crée un client Prisma relié à PostgreSQL.
 * Toutes les requêtes passent par Prisma : aucune SQL écrite à la main,
 * donc pas d'injection SQL possible.
 */
export function creerPrisma(url = process.env.DATABASE_URL, { delais = true } = {}) {
  if (!url) throw new Error("DATABASE_URL n'est pas définie (voir .env.example).");
  // Réglages adaptés à une base gratuite qui s'endort quand elle est inutilisée (Neon…) :
  //  - peu de connexions (une offre gratuite en autorise peu) ;
  //  - une connexion inactive est fermée au bout de 20 s : on ne garde pas de connexion « morte » et la base peut s'endormir ;
  //  - un délai de 10 s pour se connecter laisse le temps à la base de se réveiller.
  // Si la base coupe une connexion, le pool en rouvre une tout seul (vérifié par un test).
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: url,
      max: Number(process.env.DB_POOL_MAX) || 8,
      // `delais: false` : pour les tests qui simulent l'horloge (les délais se déclencheraient dans le temps simulé).
      ...(delais && { idleTimeoutMillis: 20_000, connectionTimeoutMillis: 10_000 }),
    }),
  });
}
