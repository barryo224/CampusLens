import { test, expect } from '@playwright/test';

// Dans une longue liste (« Afficher plus »), la barre de recherche reste collée en haut : on peut chercher à tout moment,
// sans remonter toute la page. Sur téléphone et tablette, elle se colle SOUS la barre verte.
const CAS = [
  {
    adresse: '/aides?onglet=villes',
    champ: 'Rechercher une ville',
    suite: 'Afficher 24 villes de plus',
  },
  { adresse: '/ressources', champ: 'Rechercher une ressource, un rapport', suite: null },
];

for (const { adresse, champ, suite } of CAS) {
  test(`${adresse} : la recherche reste visible en bas de liste`, async ({ page, isMobile }) => {
    await page.goto(adresse);
    const zone = page.getByRole('combobox', { name: champ });
    await expect(zone).toBeVisible();
    if (suite) {
      for (let i = 0; i < 3; i++)
        await page
          .getByRole('button', { name: /villes de plus/ })
          .first()
          .click();
    }
    // On descend loin dans la liste.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.55));
    await page.waitForTimeout(400);

    const boite = await zone.boundingBox();
    const hauteurFenetre = page.viewportSize().height;
    expect(boite, 'le champ est visible à l’écran').not.toBeNull();
    expect(boite.y).toBeGreaterThanOrEqual(0);
    expect(boite.y + boite.height).toBeLessThanOrEqual(hauteurFenetre);
    // Téléphone/tablette : sous la barre verte de 64 px (jamais cachée derrière).
    if (isMobile || page.viewportSize().width <= 900) expect(boite.y).toBeGreaterThanOrEqual(60);
    // Compacte une fois collée.
    await expect(page.locator('.recherche-collante.collee')).toBeVisible();

    // On peut chercher sans remonter : la liste se met à jour, le champ reste en place.
    await zone.click();
    await zone.pressSequentially('a');
    await page.waitForTimeout(300);
    // La liste peut raccourcir (la page se recale), mais le champ reste toujours visible à l'écran.
    const apres = await zone.boundingBox();
    expect(apres.y).toBeGreaterThanOrEqual(0);
    expect(apres.y + apres.height).toBeLessThanOrEqual(hauteurFenetre);
    // Et la liste repart au début des résultats : le premier résultat est visible, JUSTE SOUS la barre de recherche.
    const premier = page.locator('.tableau-adaptatif tbody tr').first();
    await expect(premier).toBeInViewport();
    const rang = await premier.boundingBox();
    expect(rang.y).toBeGreaterThanOrEqual(apres.y + apres.height - 2);
  });
}

test('en haut de page, la recherche garde son titre et son aide (elle n’est compacte qu’une fois collée)', async ({
  page,
}) => {
  await page.goto('/aides?onglet=villes');
  await expect(page.getByText('Rechercher une ville', { exact: true })).toBeVisible();
  await expect(page.getByText(/Exemples : « rennes »/)).toBeVisible();
  await expect(page.locator('.recherche-collante.collee')).toHaveCount(0);
});
