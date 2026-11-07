import { test, expect } from '@playwright/test';

// Page « Préparer mon budget », bas de page : le tableau « Ce qui change selon votre profil » et le bandeau « Et vous, où
// en êtes-vous ? » sont EMPILÉS, chacun sur toute la largeur. Le bandeau n'est jamais étiré à la hauteur du tableau.
test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'Joué sur Chromium bureau',
);

for (const [largeur, hauteur] of [
  [320, 700],
  [390, 844],
  [820, 1000],
  [1280, 900],
]) {
  test(`budget à ${largeur} px : tableau des profils puis bandeau d'invitation, bien rangés`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: largeur, height: hauteur });
    await page.goto('/budget');
    const tableau = page.getByRole('region', { name: 'Tableau des règles par profil' });
    const bandeau = page.locator('aside.appel');
    await expect(tableau).toBeVisible();
    await expect(bandeau).toBeVisible();
    await page.waitForLoadState('networkidle');

    const t = await tableau.boundingBox();
    const b = await bandeau.boundingBox();
    // 1. Empilés : le bandeau est SOUS le tableau, jamais à côté.
    expect(b.y).toBeGreaterThanOrEqual(t.y + t.height - 2);
    // 2. Pas étiré : un bandeau reste bas (texte + bouton), sur toutes les tailles d'écran.
    expect(b.height, 'bandeau étiré').toBeLessThan(largeur >= 820 ? 160 : 260);
    // 3. Toute la largeur de la page de contenu, rien ne dépasse.
    const ecart = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(ecart).toBeLessThanOrEqual(0);
    // 4. Large : le bouton est à droite du texte, centré verticalement avec lui.
    const bouton = await bandeau.getByRole('link', { name: /Évaluer ma situation/ }).boundingBox();
    if (largeur >= 820) {
      const texte = await bandeau.locator('p').boundingBox();
      expect(bouton.x).toBeGreaterThan(texte.x + texte.width - 2);
      expect(Math.abs(bouton.y + bouton.height / 2 - (b.y + b.height / 2))).toBeLessThanOrEqual(6);
    } else {
      const texte = await bandeau.locator('p').boundingBox();
      expect(bouton.y).toBeGreaterThanOrEqual(texte.y + texte.height - 2); // petit écran : le bouton passe sous le texte
    }
    // 5. À partir de la tablette, le tableau des profils tient d'un coup (plus de longues cartes).
    if (largeur >= 820) await expect(tableau).not.toHaveClass(/en-cartes/);
  });
}
