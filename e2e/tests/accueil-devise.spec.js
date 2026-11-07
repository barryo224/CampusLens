import { test, expect } from '@playwright/test';

// La devise de l'accueil reste entière, sur une seule ligne, avec ses deux traits, même sur les plus petits téléphones.
for (const largeur of [320, 360, 390, 768, 1280]) {
  test(`accueil à ${largeur} px : la devise tient sur une ligne, sans être coupée`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: largeur, height: 800 });
    await page.goto('/');
    const devise = page.locator('.hero-accroche');
    await expect(devise).toHaveText('S’informer, se préparer, réussir');
    const mesure = await page.evaluate(() => {
      const a = document.querySelector('.hero-accroche');
      const cadre = document.querySelector('.hero-contenu, .hero');
      const ra = a.getBoundingClientRect();
      const rc = cadre.getBoundingClientRect();
      const ligne = parseFloat(getComputedStyle(a).lineHeight) || ra.height;
      return { gauche: ra.left - rc.left, droite: rc.right - ra.right, hauteur: ra.height, ligne };
    });
    expect(mesure.gauche).toBeGreaterThanOrEqual(-1);
    expect(mesure.droite).toBeGreaterThanOrEqual(-1);
    expect(mesure.hauteur).toBeLessThan(mesure.ligne * 1.6); // une seule ligne
  });
}
