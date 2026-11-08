import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    globalSetup: ['./tests/global-setup.js'],
    setupFiles: ['./tests/setup-env.js'],
    // Les tests partagent une même base de test : on les exécute un fichier à la fois.
    fileParallelism: false,
    // Seuils exigés par le cahier des charges ; « npm run test:coverage » échoue s'ils ne sont plus respectés.
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: [
        'src/generated/**',
        'src/server.js',
        'src/admin/creer-admin.js',
        'src/seed/donnees.js',
        'src/sync/cli.js',
      ],
      thresholds: {
        lines: 90,
        'src/sync/**': { lines: 90, statements: 90 }, // robots et moteur de synchronisation : ≥ 90 %
        'src/routes/**': { lines: 80, statements: 80 }, // API : ≥ 80 %
      },
    },
  },
});
