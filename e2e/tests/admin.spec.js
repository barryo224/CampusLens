import { test, expect } from '@playwright/test';
import {
  preparerChangementCvec,
  preparerMessageContact,
  preparerAvis,
  preparerAdminCompte,
  preparerDonneeAVerifier,
  supprimerAdminDeTest,
  ADMIN,
} from '../support/base.js';

// Les deux parcours partagent un même compte de test : on les joue l'un après l'autre, et on le supprime à la fin.
test.describe.configure({ mode: 'serial' });
test.afterAll(async ({ browserName }, testInfo) => {
  // Seul le projet qui a réellement joué ces parcours supprime le compte de test : les autres projets (mobile…)
  // ignorent ces tests, mais leur nettoyage s'exécuterait quand même, en parallèle, et supprimerait le compte en cours d'usage.
  if (browserName !== 'chromium' || testInfo.project.name !== 'chromium') return;
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
    // « Voir le site » s'ouvre dans un NOUVEL onglet : l'administration reste affichée dans le premier.
    const [site] = await Promise.all([
      page.context().waitForEvent('page'),
      page.getByRole('link', { name: /^Voir le site/ }).click(),
    ]);
    await site.waitForLoadState();
    await expect(site.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();
    expect(new URL(site.url()).pathname).toBe('/');
    await expect(page.getByRole('table', { name: 'État des sources de données' })).toBeVisible(); // admin intacte
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toHaveCount(0);
    await site.close();
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
    // La pastille « non lus » est visible dès la connexion, sur n'importe quelle page de l'admin, et dans le titre
    // de l'onglet du navigateur (on voit qu'un message attend sans même ouvrir la section Messages).
    const lienMessages = page.getByRole('link', { name: /^Messages/ });
    await expect(lienMessages).toContainText(/\d/);
    await expect(lienMessages).toHaveAccessibleName(/Messages \d+ non lus?/);
    await expect(page).toHaveTitle(/^\(\d+\) Espace administration/);
    const nombre = async () => Number((await page.title()).match(/^\((\d+)\)/)?.[1] ?? 0);
    const avant = await nombre();
    expect(avant).toBeGreaterThanOrEqual(1);

    await lienMessages.click();
    await expect(page).toHaveURL(/\/admin\/messages$/);

    const carte = page.getByRole('listitem').filter({ hasText: donnees.objet });
    await expect(carte.getByText('Nouveau')).toBeVisible();
    await expect(carte).toContainText('e2e-etudiant@exemple.fr');
    await expect(carte).toContainText('ceci est un test');
    await expect(carte.getByRole('link', { name: /Répondre/ })).toHaveAttribute(
      'href',
      /^mailto:e2e-etudiant@exemple\.fr/,
    );

    // « Marquer comme lu » : plus de « Nouveau », et le compteur de la pastille baisse de 1.
    await carte.getByRole('button', { name: /^Marquer comme lu/ }).click();
    await expect(carte.getByText('Nouveau')).toHaveCount(0);
    await expect.poll(nombre).toBe(avant - 1);

    page.once('dialog', (d) => d.accept()); // fenêtre « Supprimer définitivement ? »
    await carte.getByRole('button', { name: /^Supprimer/ }).click();
    await expect(page.getByRole('status')).toContainText('Message supprimé.');
    await expect(carte).toHaveCount(0);
  });
});

test.describe('Avis des visiteurs : du formulaire public jusqu’à l’administration', () => {
  test.skip(
    ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
    'Parcours joué sur Chromium bureau',
  );

  let donnees;
  test.beforeAll(async () => {
    donnees = await preparerAvis();
  });
  test.afterAll(async () => {
    await donnees?.nettoyer();
  });

  test('un visiteur donne son avis, l’administrateur le reçoit, le lit puis le supprime', async ({
    page,
  }) => {
    // 1. Visiteur : un avis vide est refusé (aucun envoi), puis un avis complet est envoyé.
    await page.goto('/avis?page=budget');
    const envois = [];
    page.on('request', (r) => r.method() === 'POST' && envois.push(r.url()));
    await page.getByRole('button', { name: 'Envoyer mon avis' }).click();
    await expect(page.getByRole('alert')).toContainText('Choisissez une note');
    await page.getByRole('radio', { name: /5 sur 5/ }).check({ force: true });
    await page.getByRole('button', { name: 'Envoyer mon avis' }).click();
    await expect(page.getByRole('alert')).toContainText('Racontez votre expérience');
    expect(envois).toHaveLength(0); // rien n'est parti tant que l'avis est vide

    await page
      .getByLabel(/Racontez votre expérience/)
      .fill(`${donnees.repere} : le budget est clair.`);
    await page.getByRole('button', { name: 'Envoyer mon avis' }).click();
    await expect(page.getByRole('status')).toContainText('Merci pour votre avis');
    expect(envois.filter((u) => u.endsWith('/api/avis'))).toHaveLength(1);

    // 2. Administrateur : pastille sur l'onglet Avis, avis « Nouveau » avec sa note et la page d'origine.
    await page.goto('/admin');
    await page.getByLabel('Adresse e-mail').fill(ADMIN.email);
    await page.getByLabel('Mot de passe').fill(ADMIN.motDePasse);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    const lienAvis = page.getByRole('link', { name: /^Avis/ });
    await expect(lienAvis).toHaveAccessibleName(/Avis \d+ non lus?/);
    await lienAvis.click();
    await expect(page).toHaveURL(/\/admin\/avis$/);
    await expect(page.getByTestId('moyenne-avis')).toContainText('/ 5');

    const carte = page.getByRole('listitem').filter({ hasText: donnees.repere });
    await expect(carte.getByText('Nouveau')).toBeVisible();
    await expect(carte).toContainText('Note : 5 sur 5');
    await expect(carte).toContainText('Préparer mon budget'); // page d'origine du visiteur
    await expect(carte).not.toContainText('@'); // aucune adresse e-mail : l'avis est anonyme

    // 3. Marquer comme lu puis supprimer.
    await carte.getByRole('button', { name: /^Marquer comme lu/ }).click();
    await expect(carte.getByText('Nouveau')).toHaveCount(0);
    page.once('dialog', (d) => d.accept());
    await carte.getByRole('button', { name: /^Supprimer/ }).click();
    await expect(page.getByRole('status')).toContainText('Avis supprimé.');
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

test.describe('Espace administration : données à vérifier', () => {
  test.skip(
    ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
    'Parcours joué sur Chromium bureau',
  );

  let donnees;
  test.beforeAll(async () => {
    donnees = await preparerDonneeAVerifier();
  });
  test.afterAll(async () => {
    await donnees?.nettoyer();
  });

  test('vérifier une donnée : la mention « vérification en cours » disparaît du site public', async ({
    page,
    request,
  }) => {
    const publique = async () =>
      (await (await request.get('/api/associations')).json()).find(
        (a) => a.id === donnees.association.id,
      );
    expect((await publique()).aVerifier).toBe(true); // le public voit « vérification en cours »

    await page.goto('/admin/verification');
    await page.getByLabel('Adresse e-mail').fill(ADMIN.email);
    await page.getByLabel('Mot de passe').fill(ADMIN.motDePasse);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByRole('link', { name: 'Données à vérifier' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    const carte = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: donnees.nom }) });
    await expect(carte).toContainText('Organisme E2E');
    await expect(carte.getByRole('link', { name: /Ouvrir la source officielle/ })).toHaveAttribute(
      'href',
      'https://exemple.test/source',
    );
    await expect(carte).toContainText(donnees.association.nom);

    page.once('dialog', (d) => d.accept()); // « Avez-vous comparé … à sa source officielle ? »
    await carte.getByRole('button', { name: /J’ai vérifié/ }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'marqué comme vérifié' }),
    ).toBeVisible();
    await expect(carte).toHaveCount(0);

    expect((await publique()).aVerifier).toBe(false); // plus de mention côté public
  });
});
