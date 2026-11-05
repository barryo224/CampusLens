import { test, expect } from '@playwright/test';

const PAGES = [
  { lien: 'Évaluer ma situation', titre: /Évaluez votre situation/ },
  { lien: 'Mes aides', titre: /Les aides auxquelles vous avez droit/ },
  { lien: 'Préparer mon budget', titre: /Préparez votre budget/ },
  { lien: 'Ressources', titre: /Guides et sources utiles/ },
  { lien: 'À propos', titre: 'À propos' },
  { lien: 'Accueil', titre: /La précarité étudiante en France/ },
];

test('E2E-03 : navigation entre les 6 pages, élément actif correct', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  await expect(nav.getByRole('link', { name: 'Accueil' })).toHaveAttribute('aria-current', 'page');

  for (const { lien, titre } of PAGES) {
    await nav.getByRole('link', { name: lien }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(titre);
    await expect(nav.getByRole('link', { name: lien })).toHaveAttribute('aria-current', 'page');
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  }
});

test('E2E-06 : aucun défilement horizontal à 390 px, menu utilisable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  for (const chemin of ['/', '/a-propos']) {
    await page.goto(chemin);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const debordement = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(debordement, chemin).toBeLessThanOrEqual(0);
  }
  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Mes aides' })
    .click();
  await expect(page).toHaveURL(/\/aides/);
});

test('E2E-07 (début) : navigation au clavier, focus visible', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Tab se comporte différemment sous Safari');
  await page.goto('/');
  await page.keyboard.press('Tab');
  const evitement = page.getByRole('link', { name: 'Aller au contenu' });
  await expect(evitement).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'CampusLens, retour à l’accueil' })).toBeFocused();
  const contour = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  expect(contour).not.toBe('none');
});

test('l’accueil affiche les aides venant de l’API (base réelle)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Garantie Visale')).toBeVisible();
  await expect(page.getByText('Bourse sur critères sociaux')).toBeVisible();
});
