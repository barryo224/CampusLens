// Mesure Lighthouse (mobile) du site CONSTRUIT, servi comme en production, et vérifie les seuils du cahier :
// accessibilité ≥ 95, performance ≥ 90 (+ bonnes pratiques et SEO ≥ 90). Échoue sinon.
//   npm run lighthouse        (construit le site, le sert, mesure toutes les pages)
// Nécessite Chrome : on utilise celui installé pour Playwright (npx playwright install chromium).
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as attendre } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const PORT = process.env.PORT_PROD ?? '4173';
const PAGES = [
  '/',
  '/evaluer',
  '/aides',
  '/budget',
  '/ressources',
  '/a-propos',
  '/contact',
  '/avis',
  '/mentions-legales',
];
const SEUILS = { performance: 90, accessibility: 95, 'best-practices': 90, seo: 90 };

const serveur = spawn('node', ['scripts/servir-prod.mjs', PORT], { stdio: 'ignore' });
const dossier = mkdtempSync(join(tmpdir(), 'lighthouse-'));
const echecs = [];
try {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/`)).ok) break;
    } catch {
      /* pas encore prêt */
    }
    await attendre(250);
  }
  console.log('page'.padEnd(20), 'perf  a11y  bp   seo   LCP      CLS');
  for (const page of PAGES) {
    const sortie = join(dossier, `${page.replace(/\W/g, '_') || 'accueil'}.json`);
    // Une mesure peut échouer ponctuellement (Chrome lent à démarrer) : on la refait jusqu'à 3 fois.
    let d = null;
    for (let essai = 1; essai <= 3 && !d; essai++) {
      spawnSync(
        'npx',
        [
          '--yes',
          'lighthouse@12',
          `http://localhost:${PORT}${page}`,
          '--quiet',
          '--output=json',
          `--output-path=${sortie}`,
          '--only-categories=performance,accessibility,best-practices,seo',
          '--chrome-flags=--headless=new --no-sandbox',
        ],
        { stdio: 'ignore', env: { ...process.env, CHROME_PATH: chromium.executablePath() } },
      );
      try {
        const lu = JSON.parse(readFileSync(sortie, 'utf8'));
        if (!lu.runtimeError && lu.categories?.performance?.score != null) d = lu;
      } catch {
        /* fichier absent ou incomplet : on réessaie */
      }
    }
    if (!d) {
      echecs.push(`${page} : mesure Lighthouse impossible après 3 essais`);
      continue;
    }
    const note = (c) => Math.round(d.categories[c].score * 100);
    const [perf, a11y, bp, seo] = ['performance', 'accessibility', 'best-practices', 'seo'].map(
      note,
    );
    const lcp = (d.audits['largest-contentful-paint']?.displayValue ?? '—').replace(/\s/g, ' ');
    const cls = d.audits['cumulative-layout-shift']?.displayValue ?? '—';
    console.log(
      page.padEnd(20),
      String(perf).padEnd(5),
      String(a11y).padEnd(5),
      String(bp).padEnd(4),
      String(seo).padEnd(5),
      lcp.padEnd(8),
      cls,
    );
    for (const [cat, seuil] of Object.entries(SEUILS))
      if (note(cat) < seuil) echecs.push(`${page} : ${cat} = ${note(cat)} (< ${seuil})`);
  }
} finally {
  serveur.kill();
}
if (echecs.length) {
  console.error('\n❌ Seuils non atteints :\n - ' + echecs.join('\n - '));
  process.exit(1);
}
console.log(
  '\n✅ Tous les seuils Lighthouse sont atteints (performance ≥ 90, accessibilité ≥ 95).',
);
