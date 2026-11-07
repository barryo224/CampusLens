import { test, expect } from '@playwright/test';

// Dans un long tableau, les titres des colonnes restent collés en haut pendant le défilement de la page : on sait toujours
// de quelle colonne vient une valeur. Avec une barre de recherche collée, les titres se collent juste SOUS elle.
test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'Joué sur Chromium bureau',
);

const jour = (i) => `2026-11-0${(i % 5) + 1}T09:30:00Z`;

test('villes : les titres des colonnes se collent juste sous la barre de recherche collée', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/aides?onglet=villes');
  const region = page.getByRole('region', { name: 'Tableau du comparateur de villes' });
  await expect(region).toBeVisible();
  await expect(region).not.toHaveClass(/en-cartes/);
  for (let i = 0; i < 3; i++)
    await page
      .getByRole('button', { name: /villes de plus/ })
      .first()
      .click();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.5));
  await page.waitForTimeout(400);

  const recherche = await page.locator('.recherche-collante').boundingBox();
  const titres = region.locator('thead th');
  await expect(titres).toHaveCount(6);
  for (const i of [0, 3, 5]) {
    const t = await titres.nth(i).boundingBox();
    expect(t.y, `titre ${i} visible`).toBeGreaterThanOrEqual(0);
    // Juste sous la barre de recherche (jamais cachés derrière elle, jamais loin en dessous).
    expect(t.y).toBeGreaterThanOrEqual(recherche.y + recherche.height - 2);
    expect(t.y).toBeLessThanOrEqual(recherche.y + recherche.height + 12);
  }
  // Les titres lisent bien ce qu'on attend.
  await expect(titres.nth(0)).toHaveText('Ville');
  await expect(titres.nth(4)).toHaveText('Abonnement transport');
});

test('ressources : les titres des colonnes se collent sous la barre de recherche collée', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto('/ressources');
  const region = page.getByRole('region', { name: 'Tableau des ressources' });
  await expect(region).not.toHaveClass(/en-cartes/);
  await page.evaluate(() => window.scrollTo(0, 420));
  await page.waitForTimeout(400);
  const recherche = await page.locator('.recherche-collante').boundingBox();
  const premier = await region.locator('thead th').first().boundingBox();
  expect(premier.y).toBeGreaterThanOrEqual(recherche.y + recherche.height - 2);
  expect(premier.y).toBeLessThanOrEqual(recherche.y + recherche.height + 12);
});

test('administration : les titres de « État des sources » se collent sous la barre du haut ; le rappel n’est pas collé', async ({
  page,
}) => {
  const sources = Array.from({ length: 45 }, (_, i) => ({
    id: i + 1,
    cle: i < 5 ? `veille_transport_${i}` : 'loyers',
    nom: `Source ${i + 1}`,
    organisme: 'Organisme',
    niveau: 3,
    statut: 'ok',
    bloqueRobot: i < 3,
    aVerifier: false,
    robot: true,
    veille: i < 5,
    verificationManuelle: i < 5,
    frequenceHeures: 168,
    dernierControle: jour(i),
    derniereSynchronisation: { statut: 'aucun_changement', nbChangements: 0, messageErreur: null },
    changementsEnAttente: 0,
  }));
  const donnees = {
    '/admin/me': { email: 'a@b.test', role: 'admin', deuxFacteurs: true },
    '/admin/messages/non-lus': { nombre: 0, avis: 0 },
    '/admin/sources': sources,
  };
  await page.route('**/api/admin/**', (r) => {
    const u = new URL(r.request().url()).pathname.replace('/api', '');
    r.fulfill({ status: 200, json: donnees[u] ?? [] });
  });
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto('/admin/sources');
  const region = page.getByRole('region', { name: 'Tableau des sources' });
  await expect(region).toBeVisible();
  await expect(region).not.toHaveClass(/en-cartes/);
  const rappel = page.getByTestId('rappel-sites-bloques');
  await expect(rappel).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(400);

  // Le rappel n'est PAS collé : il a défilé hors de l'écran avec la page.
  await expect(rappel).not.toBeInViewport();
  // Les titres, eux, sont collés juste sous la barre d'administration.
  const barre = await page.locator('.admin-barre').boundingBox();
  const titres = region.locator('thead th');
  await expect(titres).toHaveCount(8);
  for (const i of [0, 4, 7]) {
    const t = await titres.nth(i).boundingBox();
    expect(t.y).toBeGreaterThanOrEqual(barre.y + barre.height - 2);
    expect(t.y).toBeLessThanOrEqual(barre.y + barre.height + 12);
  }
  await expect(titres.nth(0)).toHaveText('Source');
  await expect(titres.nth(7)).toHaveText('Action');
});
