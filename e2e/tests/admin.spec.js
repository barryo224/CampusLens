import { test, expect } from '@playwright/test';
import {
  preparerChangementCvec,
  preparerMessageContact,
  supprimerAdminDeTest,
  ADMIN,
} from '../support/base.js';

// Les deux parcours partagent un même compte de test : on les joue l'un après l'autre, et on le supprime à la fin.
test.describe.configure({ mode: 'serial' });
test.afterAll(async () => {
  await supprimerAdminDeTest();
});

// Le parcours admin n'a pas besoin d'être rejoué sur chaque navigateur (et il modifie des données).
test.describe('E2E-05 : espace administration', () => {
  test.skip(
    ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
    'Parcours joué sur Chromium bureau',
  );

  let donnees;
  test.beforeAll(async () => {
    donnees = await preparerChangementCvec();
  });
  test.afterAll(async () => {
    await donnees?.nettoyer();
  });

  test('connexion → valider un changement → la nouvelle valeur est visible côté public', async ({
    page,
  }) => {
    // 1. Avant : la page publique affiche la valeur actuelle de la CVEC.
    await page.goto('/budget');
    const cartes = page.getByText('CVEC', { exact: true }).first().locator('xpath=ancestor::li');
    await expect(cartes).toContainText(`${donnees.valeurInitiale}`);

    // 2. Connexion à l'espace admin (non lié depuis la navigation publique).
    await page.goto('/admin');
    await expect(
      page.getByRole('navigation', { name: 'Navigation principale' }).getByText(/admin/i),
    ).toHaveCount(0);
    await page.getByLabel('Adresse e-mail').fill(ADMIN.email);
    await page.getByLabel('Mot de passe').fill('mauvais-mot-de-passe');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByRole('alert')).toContainText('Identifiants incorrects');
    await page.getByLabel('Mot de passe').fill(ADMIN.motDePasse);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByText(/Connecté :/)).toContainText(ADMIN.email);

    // 3. Le changement détecté est listé, avec la valeur proposée ; on le valide.
    const carte = page.getByRole('listitem').filter({ hasText: 'Test E2E' });
    await expect(carte.getByLabel('CVEC')).toHaveValue(String(donnees.valeurProposee));
    await carte.getByRole('button', { name: /^Valider/ }).click();
    await expect(carte).toHaveCount(0);

    // 4. La modification apparaît dans l'historique, avec l'ancienne et la nouvelle valeur.
    await page.getByRole('tab', { name: 'Historique' }).click();
    const historique = page.getByRole('table', { name: 'Dernières modifications de données' });
    await expect(historique.getByRole('row').nth(1)).toContainText(String(donnees.valeurInitiale));
    await expect(historique.getByRole('row').nth(1)).toContainText(String(donnees.valeurProposee));

    // 5. Côté public : la nouvelle valeur est affichée, sans redéploiement.
    await page.goto('/budget');
    await expect(cartes).toContainText(`${donnees.valeurProposee}`);

    // 6. Déconnexion : l'accès est refusé ensuite.
    await page.goto('/admin');
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
  });
});

test.describe('Espace administration : messages de contact', () => {
  test.skip(
    ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
    'Parcours joué sur Chromium bureau',
  );

  let donnees;
  test.beforeAll(async () => {
    donnees = await preparerMessageContact();
  });
  test.afterAll(async () => {
    await donnees?.nettoyer();
  });

  test('lire un message puis le supprimer', async ({ page }) => {
    await page.goto('/admin');
    await page.getByLabel('Adresse e-mail').fill(ADMIN.email);
    await page.getByLabel('Mot de passe').fill(ADMIN.motDePasse);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.getByRole('tab', { name: 'Messages' }).click();

    const carte = page.getByRole('listitem').filter({ hasText: donnees.objet });
    await expect(carte).toContainText('e2e-etudiant@exemple.fr');
    await expect(carte).toContainText('ceci est un test');
    await expect(carte.getByRole('link', { name: /Répondre/ })).toHaveAttribute(
      'href',
      /^mailto:e2e-etudiant@exemple\.fr/,
    );

    page.once('dialog', (d) => d.accept()); // fenêtre « Supprimer définitivement ? »
    await carte.getByRole('button', { name: /^Supprimer/ }).click();
    await expect(page.getByRole('status')).toContainText('Message supprimé.');
    await expect(carte).toHaveCount(0);
  });
});
