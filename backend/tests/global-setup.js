import { execSync } from 'node:child_process';

// Avant les tests : applique les migrations sur la base de TEST (jamais sur la vraie base).
export default function setup() {
  try {
    process.loadEnvFile();
  } catch {
    /* pas de .env : variables du système (CI) */
  }
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.warn('TEST_DATABASE_URL absente : les tests de base de données échoueront.');
    return;
  }
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url },
  });
}
