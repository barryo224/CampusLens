import { test, expect } from '@playwright/test';
import {
  preparerChangementCvec,
  preparerMessageContact,
  preparerAdminCompte,
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
    // L'admin a sa propre mise en page : le menu du site public n'y apparaît pas.
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toHaveCount(0);
    await page.getByLabel('Adresse e-mail').fill(ADMIN.email);
    // Le refus est simulé : de vrais échecs de connexion répétés (à chaque exécution des tests) finiraient par
    // déclencher le blocage anti-force-brute du serveur, qui est testé ailleurs (API-13).
    await page.route(
      '**/api/admin/login',
      (r) => r.fulfill({ status: 401, json: { error: 'Identifiants incorrects.' } }),
      { times: 1 },
    );
    await page.getByLabel('Mot de passe').fill('mauvais-mot-de-passe');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByRole('alert')).toContainText('Identifiants incorrects');
    await page.getByLabel('Mot de passe').fill(ADMIN.motDePasse);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByText(`${ADMIN.email} (admin)`)).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Sections de l’administration' }),
    ).toBeVisible();

    // 3. Le changement détecté est listé, avec la valeur proposée ; on le valide.
    const carte = page.getByRole('listitem').filter({ hasText: 'Test E2E' });
    await expect(carte.getByLabel('CVEC')).toHaveValue(String(donnees.valeurProposee));
    await carte.getByRole('button', { name: /^Valider/ }).click();
    await expect(carte).toHaveCount(0);

    // 4. La modification apparaît dans l'historique, avec l'ancienne et la nouvelle valeur.
    await page.getByRole('link', { name: 'Historique' }).click();
    await expect(page).toHaveURL(/\/admin\/historique$/);
    const historique = page.getByRole('table', { name: 'Dernières modifications de données' });
    await expect(historique.getByRole('row').nth(1)).toContainText(String(donnees.valeurInitiale));
    await expect(historique.getByRole('row').nth(1)).toContainText(String(donnees.valeurProposee));

    // 5. Côté public : la nouvelle valeur est affichée, sans redéploiement.
    await page.goto('/budget');
    await expect(cartes).toContainText(`${donnees.valeurProposee}`);

    // 6. L'admin reste utilisable : section dans l'adresse, rechargement, sortie vers le site puis retour.
    await page.goto('/admin/sources');
    await expect(page.getByRole('table', { name: 'État des sources de données' })).toBeVisible();
    await page.reload(); // la section est conservée, on reste connecté
    await expect(page.getByRole('table', { name: 'État des sources de données' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Voir le site' }).click();
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();
    await page.goBack(); // retour à l'admin : toujours connecté, sans ressaisir le mot de passe
    await expect(page.getByRole('table', { name: 'État des sources de données' })).toBeVisible();

    // 7. Déconnexion : l'accès est refusé ensuite.
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
    await page.getByRole('link', { name: 'Messages' }).click();
    await expect(page).toHaveURL(/\/admin\/messages$/);

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

test.describe('Espace administration : changer son mot de passe', () => {
  test.skip(
    ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
    'Parcours joué sur Chromium bureau',
  );

  let compte;
  test.beforeAll(async () => {
    compte = await preparerAdminCompte();
  });
  test.afterAll(async () => {
    await compte?.nettoyer();
  });

  test('changer son mot de passe → déconnexion → reconnexion avec le nouveau', async ({ page }) => {
    const NOUVEAU = 'Une phrase de passe e2e vraiment solide 2026';
    await page.goto('/admin/compte');
    await page.getByLabel('Adresse e-mail').fill(compte.email);
    await page.getByLabel('Mot de passe').fill(compte.motDePasse);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByRole('heading', { name: 'Changer mon mot de passe' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mon compte' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    // Contrôles côté navigateur avant tout envoi.
    await page.getByLabel('Mot de passe actuel').fill(compte.motDePasse);
    await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('court');
    await page.getByLabel('Confirmer le nouveau mot de passe').fill('court');
    await expect(page.getByRole('button', { name: 'Changer mon mot de passe' })).toBeDisabled();

    await page.getByLabel('Nouveau mot de passe', { exact: true }).fill(NOUVEAU);
    await page.getByLabel('Confirmer le nouveau mot de passe').fill(NOUVEAU);
    await page.getByRole('button', { name: 'Changer mon mot de passe' }).click();
    await expect(page.getByRole('status')).toContainText('Mot de passe modifié');

    // La session reste ouverte ; on se déconnecte puis on se reconnecte avec le NOUVEAU mot de passe.
    await page.getByRole('link', { name: 'À valider' }).click();
    await expect(
      page.getByRole('navigation', { name: 'Sections de l’administration' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
    await page.getByLabel('Adresse e-mail').fill(compte.email);
    await page.getByLabel('Mot de passe').fill(NOUVEAU);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByText(`${compte.email} (admin)`)).toBeVisible();
  });
});
