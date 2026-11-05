import { test, expect } from '@playwright/test';

// Vérifie le site CONSTRUIT avec ses en-têtes de production : lancer « npm run test:e2e:prod ».
// (Le serveur de développement n'envoie pas ces en-têtes : ces tests sont alors ignorés.)
test.skip(
  !process.env.BASE_URL,
  'À lancer avec « npm run test:e2e:prod » (site construit + en-têtes de production)',
);

/** Collecte toute violation de la politique de sécurité (CSP) survenant pendant le test. */
function surveillerCsp(page) {
  const violations = [];
  page.on('console', (m) => {
    if (/content security policy|violates the following/i.test(m.text()))
      violations.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => violations.push(`erreur : ${e.message.slice(0, 200)}`));
  page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`Content Security Policy : ${e.violatedDirective} bloque ${e.blockedURI}`);
    });
  });
  return violations;
}

test('en-têtes de sécurité du site : CSP stricte, anti-iframe, HSTS, pas de sniffing', async ({
  request,
}) => {
  const reponse = await request.get('/');
  const h = reponse.headers();
  const csp = h['content-security-policy'];
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("script-src 'self'"); // pas de script inline ni externe
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("form-action 'self'");
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(h['strict-transport-security']).toMatch(/max-age=\d{7,}/);
  expect(h['permissions-policy']).toContain('geolocation=()');
  expect(h['cross-origin-opener-policy']).toBe('same-origin');
  // Les fichiers versionnés sont mis en cache longtemps ; la page elle-même ne l'est pas indéfiniment.
  const html = await reponse.text();
  const css = html.match(/href="(\/assets\/[^"]+\.css)"/)[1];
  expect((await request.get(css)).headers()['cache-control']).toContain('immutable');
});

test('robots.txt valide : le site est indexable, l’admin et l’API ne le sont pas', async ({
  request,
}) => {
  const txt = await (await request.get('/robots.txt')).text();
  expect(txt).toContain('User-agent: *');
  expect(txt).toContain('Disallow: /admin');
  expect(txt).toContain('Disallow: /api/');
  expect(txt).not.toContain('<html'); // pas la page d'accueil renvoyée à la place
});

test('aucune violation de la CSP sur toutes les pages publiques ni dans le simulateur', async ({
  page,
}) => {
  const violations = surveillerCsp(page);
  for (const chemin of [
    '/',
    '/evaluer',
    '/aides',
    '/aides?onglet=associations',
    '/aides?onglet=villes',
    '/budget',
    '/ressources',
    '/a-propos',
    '/contact',
    '/mentions-legales',
  ]) {
    await page.goto(chemin);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
  }
  // Polices (fichiers du site) et images WebP : tout doit se charger malgré la CSP.
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const polices = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family);
  });
  expect(polices).toContain('Plus Jakarta Sans Variable');
  expect(
    await page.evaluate(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0)),
  ).toBe(true);
  expect(violations).toEqual([]);
});

test('le bilan PDF (bibliothèque chargée au clic, fichier « blob: ») fonctionne malgré la CSP', async ({
  page,
}) => {
  const violations = surveillerCsp(page);
  await page.goto('/evaluer');
  await page.getByLabel('Prénom (facultatif)', { exact: true }).fill('Zoé');
  await page.getByLabel('Job étudiant (net)').fill('600');
  await page.getByLabel('Loyer charges comprises').fill('637');
  const telechargement = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Télécharger mon bilan (PDF)' }).click();
  expect((await telechargement).suggestedFilename()).toBe('zoe-mon-budget.pdf');
  expect(violations).toEqual([]);
});

test('formulaire de contact, estimation OpenFisca et administration : aucune violation de la CSP', async ({
  page,
}) => {
  const violations = surveillerCsp(page);
  await page.route('**/api/contact', (r) => r.fulfill({ status: 201, json: { message: 'ok' } }));
  await page.route('**/api/simulation/aides-estimees', (r) =>
    r.fulfill({
      json: {
        periode: '2026-11',
        aides: [
          {
            slug: 'a',
            nom: 'Aide',
            codeOpenfisca: 'aide_logement',
            montantMensuel: 100,
            details: { apl: 0, als: 100 },
          },
        ],
        moteur: { nom: 'OpenFisca France', version: '1' },
        source: null,
        verifieLe: '2026-11-05T10:00:00Z',
        aVerifier: false,
        avertissement: 'x',
      },
    }),
  );
  await page.goto('/contact');
  await page.getByLabel('Objet').fill('Test');
  await page.getByLabel('Votre adresse e-mail').fill('a@b.fr');
  await page.getByLabel('Message').fill('Bonjour');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.getByRole('status')).toContainText('Message envoyé');

  await page.goto('/evaluer');
  await page.getByLabel('Loyer charges comprises').fill('500');
  await page.getByText('Estimer mon aide au logement').first().click();
  const formulaire = page.getByRole('form', { name: 'Estimation de l’aide au logement' });
  await formulaire.getByLabel('Ville où vous étudiez').selectOption({ label: 'Rennes' });
  await formulaire.getByLabel('Votre âge').fill('20');
  await formulaire.getByRole('button', { name: 'Estimer mon aide au logement' }).click();
  await expect(formulaire.getByText(/≈\s100\s€/)).toBeVisible();

  await page.goto('/admin'); // page d'administration chargée à la demande (code séparé) : doit aussi respecter la CSP
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
  expect(violations).toEqual([]);
});

test('aucun cookie n’est posé à un visiteur non connecté (ni sur le site, ni sur l’API admin)', async ({
  request,
}) => {
  for (const chemin of ['/', '/api/aides', '/api/parametres']) {
    expect((await request.get(chemin)).headers()['set-cookie'], chemin).toBeUndefined();
  }
  const admin = await request.get('/api/admin/me');
  expect(admin.status()).toBe(401);
  expect(admin.headers()['set-cookie']).toBeUndefined();
});

test('l’API ne divulgue ni technologie ni détail technique', async ({ request }) => {
  const h = (await request.get('/api/health')).headers();
  expect(h['x-powered-by']).toBeUndefined();
  const erreur = await request.get('/api/ressource-inconnue');
  expect(erreur.status()).toBe(404);
  expect(JSON.stringify(await erreur.json())).not.toMatch(/stack|express|node_modules/i);
});
