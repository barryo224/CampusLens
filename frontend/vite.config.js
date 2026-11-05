import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Aucun fichier n'est intégré au CSS/JS en « data: » : la politique de sécurité (CSP) du site les refuse,
    // et chaque police ou image garde ainsi son propre fichier, mis en cache séparément.
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    // En développement, /api est relayé vers le backend.
    proxy: { '/api': 'http://localhost:3001' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.{js,jsx}', 'src/**/*.test.{js,jsx}'],
    // Seuils exigés par le cahier des charges ; « npm run test:coverage » échoue s'ils ne sont plus respectés.
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      thresholds: {
        lines: 85,
        'src/lib/simulation.js': { lines: 90, statements: 90, branches: 90, functions: 90 }, // calcul du reste-à-vivre : ≥ 90 %
      },
    },
  },
});
