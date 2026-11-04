import { defineConfig } from 'prisma/config';

// Charge backend/.env s'il existe (jamais publié).
try {
  process.loadEnvFile();
} catch {
  /* pas de fichier .env : on utilise les variables du système */
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: process.env.DATABASE_URL },
  migrations: { path: 'prisma/migrations', seed: 'node prisma/seed.js' },
});
