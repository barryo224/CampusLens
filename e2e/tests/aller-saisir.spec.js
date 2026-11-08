import { test, expect } from '@playwright/test';

// Télécharger sans rien saisir : le message demande de saisir, et « Aller saisir mes montants » donne le premier champ
// sans perdre le contexte (ordinateur : tout en haut de la page ; téléphone : le début du bloc « Vos revenus mensuels »).

test('la jauge montre dès le début le montant de base (droits et CVEC lissés), sans verdict ni texte d’aide, puis la situation à la saisie', async ({
  page,
}) => {
  await page.goto('/evaluer');
  await expect(page.locator('svg.jauge')).toBeVisible();
  await expect(page.getByTestId('aiguille')).toHaveCount(1);
  await expect(page.getByTestId('reste')).toHaveText(/−\s?24\s?€/);
  await expect(page.getByTestId('reste-vide')).toBeVisible();
  await expect(page.getByText('Budget en difficulté')).toHaveCount(0);
  // L'outil de mesure reste intact, sans texte d'aide ni paragraphe sur les seuils en plus.
  await expect(page.getByText('Ajoutez vos montants')).toHaveCount(0);
  await expect(page.getByText(/seuil de pauvreté/i)).toHaveCount(0);
  await page.getByLabel('Job étudiant (net)').fill('600');
  await expect(page.getByTestId('reste-vide')).toHaveCount(0);
  await expect(page.getByTestId('reste')).toHaveText(/576\s?€/);
});

test('« Aller saisir mes montants » : premier champ à l’écran, bloc des revenus visible, jamais un champ caché', async ({
  page,
}) => {
  await page.goto('/evaluer');
  await page.getByRole('button', { name: 'Télécharger mon bilan (PDF)' }).click();
  await expect(page.getByRole('alert')).toBeInViewport();
  const telephone = (page.viewportSize()?.width ?? 1280) <= 900;
  await page.getByRole('button', { name: 'Aller saisir mes montants' }).click();
  await page.waitForTimeout(500);

  const champ = page.getByLabel('Job étudiant (net)');
  await expect(champ).toBeFocused();
  await expect(champ).toBeInViewport();
  await expect(page.getByRole('heading', { name: 'Vos revenus mensuels' })).toBeInViewport();
  const y = await page.evaluate(() => Math.round(scrollY));
  if (telephone) {
    // Le début du bloc est juste sous les barres : le titre est visible avec son premier champ.
    const haut = await page
      .getByRole('heading', { name: 'Vos revenus mensuels' })
      .evaluate((h) => Math.round(h.getBoundingClientRect().top));
    expect(haut).toBeGreaterThan(40);
    expect(haut).toBeLessThan(260);
    expect(y).toBeGreaterThan(0);
  } else {
    expect(y).toBe(0); // ordinateur : on remonte sur toute la page
  }
});
