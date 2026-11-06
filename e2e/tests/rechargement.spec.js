import { test, expect } from '@playwright/test';

test.describe('Recharger la page repart de zéro', () => {
  test('Mes aides : profil et besoin reviennent aux valeurs par défaut après un rechargement', async ({
    page,
  }) => {
    await page.goto('/aides?profil=boursier&besoin=urgence');
    await expect(page.getByRole('radio', { name: /boursier/i })).toBeChecked();
    await page.reload();
    await expect(page.getByRole('radio', { name: /Étudiant français/i })).toBeChecked();
    await expect(page.getByLabel('Besoin')).toHaveValue('');
    await expect(page).toHaveURL(/\/[a-z]+$/);
  });

  test('Budget : le niveau choisi revient à « Licence » après un rechargement', async ({
    page,
  }) => {
    await page.goto('/budget?niveau=master');
    await page.reload();
    await expect(page).toHaveURL(/\/[a-z]+$/);
    await expect(page.getByRole('button', { name: 'Licence' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('Évaluer : un rechargement remet profil et montants par défaut', async ({ page }) => {
    await page.goto('/evaluer');
    await page.getByLabel('Job étudiant (net)').fill('600');
    await page.locator('label.choix', { hasText: 'Master' }).click();
    await page.reload();
    await expect(page.getByLabel('Job étudiant (net)')).toHaveValue('');
    await expect(
      page.locator('label.choix', { hasText: 'Licence' }).locator('input'),
    ).toBeChecked();
  });
});
