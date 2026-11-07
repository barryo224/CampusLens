import { test, expect } from '@playwright/test';

// Cliquer dans une barre de recherche ne doit JAMAIS faire bouger la page (pas de saut, pas de « vibration »).
const PAGES = [
  { adresse: '/ressources', champ: 'Rechercher une ressource, un rapport' },
  { adresse: '/aides?onglet=villes', champ: 'Rechercher une ville' },
];

for (const { adresse, champ } of PAGES) {
  test(`${adresse} : un clic dans le champ de recherche laisse la page exactement où elle est`, async ({
    page,
  }) => {
    await page.goto(adresse);
    const zone = page.getByRole('combobox', { name: champ });
    await expect(zone).toBeVisible();
    // La page est défilée un peu : un déplacement parasite se verrait.
    await page.evaluate(() => window.scrollTo(0, 120));
    await page.waitForTimeout(150);
    const avant = await page.evaluate(() => window.scrollY);
    await zone.click();
    await page.waitForTimeout(500);
    const apres = await page.evaluate(() => window.scrollY);
    expect(Math.abs(apres - avant)).toBeLessThanOrEqual(1);
    // Saisir une lettre non plus.
    await zone.pressSequentially('a');
    await page.waitForTimeout(400);
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - avant)).toBeLessThanOrEqual(1);
  });
}
