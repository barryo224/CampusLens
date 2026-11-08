import { test, expect } from '@playwright/test';

// Après avoir touché une suggestion (ville, ressource), la liste raccourcit et la page se recale : le premier résultat ne
// doit JAMAIS rester à moitié caché derrière la barre de recherche collée ni derrière les titres de colonnes collés.
// (Mesuré avant correction : 60 px cachés sur iPhone et sur un ordinateur de 720 px de haut.)
const CAS = [
  { adresse: '/aides?onglet=villes', champ: 'Rechercher une ville', saisie: 'ren' },
  { adresse: '/ressources', champ: 'Rechercher une ressource, un rapport', saisie: 'visa' },
];

for (const { adresse, champ, saisie } of CAS) {
  test(`${adresse} : après le choix d’une suggestion, le premier résultat est entièrement visible`, async ({
    page,
  }) => {
    await page.goto(adresse);
    const zone = page.getByRole('combobox', { name: champ });
    await expect(zone).toBeVisible();
    await zone.click();
    await zone.pressSequentially(saisie, { delay: 80 });
    await page.getByRole('option').first().click();
    await page.waitForTimeout(1300); // la page se recale en plusieurs passes
    const m = await page.evaluate(() => {
      const barre = document.querySelector('.recherche-collante').getBoundingClientRect();
      const entete = document.querySelector('.tableau thead');
      const enteteBas =
        entete && entete.getBoundingClientRect().height > 4
          ? entete.getBoundingClientRect().bottom
          : 0;
      const ligne = document.querySelector('.tableau tbody tr').getBoundingClientRect();
      return {
        limite: Math.max(barre.bottom, enteteBas),
        haut: ligne.top,
        bas: ligne.bottom,
        fenetre: innerHeight,
      };
    });
    expect(
      m.haut,
      `début du résultat à ${Math.round(m.haut)} px, caché sous ${Math.round(m.limite)} px`,
    ).toBeGreaterThanOrEqual(m.limite - 2);
    expect(m.haut).toBeLessThan(m.fenetre); // et il est bien à l'écran
  });
}
