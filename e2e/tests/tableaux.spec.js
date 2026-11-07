import { test, expect } from '@playwright/test';

// Les tableaux s'adaptent à l'écran : un vrai tableau quand la place suffit, des cartes sinon. Jamais de cadre défilant
// (ni vertical, ni horizontal) : la page seule défile, avec un rendu soigné sur chaque taille d'écran.
const TAILLES = [
  { nom: 'petit téléphone', largeur: 320, hauteur: 700 },
  { nom: 'téléphone', largeur: 390, hauteur: 844 },
  { nom: 'tablette', largeur: 820, hauteur: 1000 },
  { nom: 'ordinateur', largeur: 1280, hauteur: 860 },
];
const PAGES = [
  { adresse: '/aides?onglet=villes', zone: 'Tableau du comparateur de villes', colonnes: 6 },
  { adresse: '/ressources', zone: 'Tableau des ressources', colonnes: 6 },
  { adresse: '/budget', zone: 'Tableau des règles par profil', colonnes: 4 },
];

test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'Joué sur Chromium bureau',
);

for (const taille of TAILLES) {
  for (const { adresse, zone, colonnes } of PAGES) {
    test(`${adresse} à ${taille.largeur} px (${taille.nom}) : tout se lit sans défiler dans un cadre`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: taille.largeur, height: taille.hauteur });
      await page.goto(adresse);
      const region = page.getByRole('region', { name: zone });
      await expect(region).toBeVisible();
      await page.waitForLoadState('networkidle');

      // 1. Aucun défilement à l'intérieur du tableau, et la page ne déborde pas de l'écran.
      const mesures = await region.evaluate((e) => ({
        v: e.scrollHeight > e.clientHeight + 1,
        h: e.scrollWidth > e.clientWidth + 1,
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        cartes: e.classList.contains('en-cartes'),
      }));
      expect(mesures.v, 'défilement vertical dans le tableau').toBe(false);
      expect(mesures.h, 'défilement horizontal dans le tableau').toBe(false);
      expect(mesures.page, 'débordement de la page').toBeLessThanOrEqual(0);

      // 2. Selon la place réellement disponible : des cartes (chaque valeur précédée du nom de sa colonne) ou un vrai
      //    tableau dont toutes les colonnes se voient d'un coup. Sur petit écran, ce sont toujours des cartes.
      if (taille.largeur <= 390) expect(mesures.cartes, 'petit écran : cartes').toBe(true);
      if (mesures.cartes) {
        const etiquettes = await region
          .locator('tbody tr')
          .first()
          .locator('td[data-label]')
          .count();
        expect(etiquettes).toBeGreaterThanOrEqual(colonnes - 2);
        const sorties = await region
          .locator('tbody tr')
          .evaluateAll(
            (lignes) =>
              lignes.filter((l) => l.getBoundingClientRect().right > window.innerWidth + 1).length,
          );
        expect(sorties, 'cartes hors de l’écran').toBe(0);
      } else {
        const entetes = region.locator('thead th');
        await expect(entetes).toHaveCount(colonnes);
        const dehors = await entetes.evaluateAll(
          (ths) =>
            ths.filter((t) => t.getBoundingClientRect().right > window.innerWidth + 1).length,
        );
        expect(dehors, 'colonnes hors de l’écran').toBe(0);
      }
    });
  }
}

test('les tableaux gardent leur structure pour les lecteurs d’écran, même en cartes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ressources');
  const region = page.getByRole('region', { name: 'Tableau des ressources' });
  await expect(region.getByRole('table')).toBeVisible();
  await expect(region.getByRole('columnheader').first()).toBeAttached();
  expect(await region.getByRole('row').count()).toBeGreaterThan(5);
  expect(await region.getByRole('rowheader').count()).toBeGreaterThan(5);
});
