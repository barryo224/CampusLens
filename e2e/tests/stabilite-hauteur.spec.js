import { test, expect } from '@playwright/test';

// Une page ne doit JAMAIS changer de hauteur pendant qu'on la fait défiler : sur téléphone, un saut de hauteur au bas de la
// page fait « trembler » le pied de page (en plus du rebond du téléphone), et un saut en cours de route fait sauter le contenu.
// Cas trouvés : la barre « reste-à-vivre » (retirée de la page : −88 px) et la barre de recherche qui se colle (−68 à −87 px).
const PAGES = [
  {
    adresse: '/evaluer',
    avant: async (page) => {
      await page.getByLabel('Job étudiant (net)').fill('600');
      await page.getByLabel('Loyer charges comprises').fill('420');
    },
  },
  { adresse: '/aides?onglet=villes' },
  { adresse: '/ressources' },
  { adresse: '/aides' },
  { adresse: '/budget' },
  { adresse: '/' },
];

for (const { adresse, avant } of PAGES) {
  test(`${adresse} : la hauteur de la page ne change pas pendant le défilement`, async ({
    page,
  }) => {
    await page.goto(adresse);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    if (avant) await avant(page);
    await page.waitForTimeout(400);
    const hauteur = () => page.evaluate(() => document.documentElement.scrollHeight);
    const depart = await hauteur();
    const changements = [];
    // Descente par petits pas jusqu'en bas, puis remontée : chaque pas relit la hauteur.
    for (let y = 0; y <= depart + 300; y += 120) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(40);
      const h = await hauteur();
      if (Math.abs(h - depart) > 1) changements.push(`${depart} → ${h} à y=${y}`);
    }
    for (let y = depart; y >= 0; y -= 120) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(40);
      const h = await hauteur();
      if (Math.abs(h - depart) > 1) changements.push(`${depart} → ${h} en remontant à y=${y}`);
    }
    expect(changements, 'la hauteur de la page a changé pendant le défilement').toEqual([]);
  });
}
