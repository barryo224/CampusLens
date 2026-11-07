import { test, expect } from '@playwright/test';

// Dans « Aides financières », le nom et la description de chaque aide gardent toute la largeur (jamais écrasés en une
// colonne étroite où les mots se cassent lettre par lettre) ; l'étiquette et le bouton passent dessous.
for (const largeur of [320, 390, 820, 1280]) {
  test(`Aides financières à ${largeur} px : textes entiers, rien ne dépasse`, async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: 900 });
    await page.goto('/aides');
    await expect(page.locator('.liste-aides .aide').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    const m = await page.evaluate(() => {
      const aides = [...document.querySelectorAll('.liste-aides .aide')];
      const page = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      return {
        page,
        nb: aides.length,
        // Un mot court cassé en pleine lettre = colonne trop étroite : le titre ne doit jamais faire plus de 4 lignes.
        titresTropHauts: aides.filter((a) => {
          const t = a.querySelector('h3');
          return (
            t.getBoundingClientRect().height > parseFloat(getComputedStyle(t).lineHeight) * 4.5
          );
        }).length,
        corpsLarges: aides.filter(
          (a) => a.querySelector('.aide-corps').getBoundingClientRect().width < 140,
        ).length,
        // Étiquette et bouton à l'intérieur de leur carte (jamais coupés à droite).
        dehors: aides.filter((a) => {
          const carte = a.getBoundingClientRect();
          return [...a.querySelectorAll('.aide-actions > *')].some(
            (e) => e.getBoundingClientRect().right > carte.right + 1,
          );
        }).length,
      };
    });
    expect(m.page).toBeLessThanOrEqual(0);
    expect(m.nb).toBeGreaterThan(3);
    expect(m.titresTropHauts).toBe(0);
    expect(m.corpsLarges, 'texte écrasé dans une colonne trop étroite').toBe(0);
    expect(m.dehors, 'étiquette ou bouton qui dépasse').toBe(0);
  });
}
