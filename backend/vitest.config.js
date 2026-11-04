import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    globalSetup: ['./tests/global-setup.js'],
    setupFiles: ['./tests/setup-env.js'],
    // Les tests partagent une même base de test : on les exécute un fichier à la fois.
    fileParallelism: false,
  },
});
