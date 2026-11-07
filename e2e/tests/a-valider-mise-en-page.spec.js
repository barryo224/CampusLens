import { test, expect } from '@playwright/test';

// Page « À valider » : cartes compactes sur ordinateur (nom, valeur et précision sur UNE ligne), empilées sur téléphone
// sans que rien ne soit écrasé (le texte « actuelle : … » ne doit jamais devenir une colonne de lettres).
test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'Joué sur Chromium bureau',
);

const changement = {
  id: 1,
  resume: 'La page a changé : 105 → 106 €.',
  statut: 'a_valider',
  creeLe: '2026-11-05T09:30:00Z',
  source: {
    id: 1,
    nom: 'Contribution de vie étudiante et de campus (CVEC)',
    organisme: 'CVEC',
    url: 'https://cvec.etudiant.gouv.fr',
  },
  suggestions: [{ parametreId: 12, valeur: 106 }],
  parametres: [
    { id: 12, cle: 'cvec', niveau: 'aucun', profil: null, valeur: 105, unite: '€ / an' },
  ],
};

async function ouvrir(page, largeur, hauteur) {
  const donnees = {
    '/admin/me': { email: 'a@b.test', role: 'admin', deuxFacteurs: true },
    '/admin/messages/non-lus': { nombre: 0, avis: 0 },
    '/admin/changements': [changement],
  };
  await page.route('**/api/admin/**', (r) => {
    const u = new URL(r.request().url()).pathname.replace('/api', '');
    r.fulfill({ status: 200, json: donnees[u] ?? [] });
  });
  await page.setViewportSize({ width: largeur, height: hauteur });
  await page.goto('/admin/changements');
  await expect(page.getByRole('heading', { name: /Contribution de vie étudiante/ })).toBeVisible();
  await page.waitForLoadState('networkidle');
}

test('ordinateur : carte compacte, nom + valeur + précision sur une seule ligne, boutons juste dessous', async ({
  page,
}) => {
  await ouvrir(page, 1280, 900);
  const carte = page.locator('li.changement').first();
  const c = await carte.boundingBox();
  expect(c.height, 'carte trop haute').toBeLessThan(280);
  const nom = await carte.locator('.champ-ligne label').boundingBox();
  const champ = await carte.locator('.champ-ligne input').boundingBox();
  const precision = await carte.locator('.champ-ligne .fraicheur').boundingBox();
  // Une seule ligne : même hauteur, de gauche à droite.
  expect(Math.abs(nom.y + nom.height / 2 - (champ.y + champ.height / 2))).toBeLessThanOrEqual(6);
  expect(champ.x).toBeGreaterThan(nom.x + nom.width - 2);
  expect(precision.x).toBeGreaterThan(champ.x + champ.width - 2);
  // Les boutons suivent de près la valeur (plus de grand vide).
  const valider = await carte.getByRole('button', { name: /^Valider/ }).boundingBox();
  expect(valider.y - (champ.y + champ.height)).toBeLessThan(40);
});

test('téléphone : tout est empilé, lisible, rien d’écrasé ni de coupé', async ({ page }) => {
  await ouvrir(page, 390, 844);
  const carte = page.locator('li.changement').first();
  const precision = await carte.locator('.champ-ligne .fraicheur').boundingBox();
  expect(precision.width, 'texte écrasé en colonne étroite').toBeGreaterThan(150);
  expect(precision.height, 'texte écrasé en colonne étroite').toBeLessThan(60);
  const champ = await carte.locator('.champ-ligne input').boundingBox();
  expect(champ.width).toBeGreaterThan(200); // le champ prend la largeur disponible
  const ecart = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(ecart).toBeLessThanOrEqual(0);
});
