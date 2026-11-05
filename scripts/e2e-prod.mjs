// Lance les tests de bout en bout contre le site CONSTRUIT, servi avec les en-têtes de production
// (CSP, HSTS…) : on vérifie ainsi que la politique de sécurité ne casse aucune fonctionnalité.
//   npm run test:e2e:prod            (Chromium + mobile)
//   npm run test:e2e:prod -- --project=firefox
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as attendre } from 'node:timers/promises';

const PORT = process.env.PORT_PROD ?? '4173';
const serveur = spawn('node', ['scripts/servir-prod.mjs', PORT], { stdio: 'inherit' });
try {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/`)).ok) break;
    } catch {
      /* pas encore prêt */
    }
    await attendre(250);
  }
  const arguments_ = process.argv.slice(2);
  const projets = arguments_.some((a) => a.startsWith('--project'))
    ? []
    : ['--project=chromium', '--project=mobile'];
  const r = spawnSync(
    'npx',
    ['playwright', 'test', '--config', 'e2e/playwright.config.js', ...projets, ...arguments_],
    {
      stdio: 'inherit',
      env: { ...process.env, BASE_URL: `http://localhost:${PORT}` },
    },
  );
  process.exitCode = r.status ?? 1;
} finally {
  serveur.kill();
}
