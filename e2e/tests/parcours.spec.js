import { test, expect } from '@playwright/test';

async function remplirBudgetDeReference(page) {
  const champs = {
    'Job étudiant (net)': '600',
    'Aide de la famille': '250',
    'Loyer charges comprises': '637',
    Alimentation: '200',
    Transport: '30',
    'Téléphone et internet': '20',
    'Santé et mutuelle': '15',
    'Autres dépenses': '50',
  };
  for (const [libelle, valeur] of Object.entries(champs)) {
    await page.getByLabel(libelle).fill(valeur);
  }
}

test('E2E-01 : Accueil → Évaluer → saisie → « Voir les aides pour moi » → aides du bon profil', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('region', { name: /Les repères pour bien vivre ses études en France/ })
    .getByRole('link', { name: /Évaluer ma situation/ })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Évaluez votre situation');

  await remplirBudgetDeReference(page);
  await expect(page.getByTestId('reste')).toContainText('126');
  await expect(page.getByText('Budget en difficulté : des aides existent')).toBeVisible();

  // On coche « boursier » : l'arrivée sur Mes aides doit être filtrée sur ce profil.
  await page.getByLabel('Je suis boursier CROUS').check();
  await page.getByRole('link', { name: /Voir les aides pour moi/ }).click();

  await expect(page).toHaveURL(/\/aides\?profil=boursier/);
  await expect(page.getByRole('radio', { name: /Étudiant boursier/ })).toBeChecked();
  await expect(page.getByText('Vous en bénéficiez')).toBeVisible(); // badge propre au profil boursier
});

test('E2E-02 : aucune requête réseau ne contient les montants saisis', async ({ page }) => {
  const requetes = [];
  page.on('request', (r) =>
    requetes.push({ url: r.url(), methode: r.method(), corps: r.postData() }),
  );

  await page.goto('/evaluer');
  await expect(page.getByLabel('Job étudiant (net)')).toBeVisible();
  const avant = requetes.length;
  await page.getByLabel('Prénom (facultatif)', { exact: true }).fill('Marie');
  await page.getByLabel('Nom (facultatif)', { exact: true }).fill('Confidentielle');

  await remplirBudgetDeReference(page);
  await page.getByLabel('Je suis boursier CROUS').check();
  await page.getByText('Étudiant international hors UE').click(); // clic sur l'étiquette, comme un utilisateur
  await expect(page.getByTestId('reste')).not.toBeEmpty();

  // L'estimation OpenFisca est facultative et repliée : elle n'envoie rien tant qu'on ne clique pas dessus.
  await expect(page.getByRole('form', { name: 'Estimation de l’aide au logement' })).toHaveCount(0);

  // Saisir et recalculer ne déclenche AUCUNE requête…
  expect(requetes.length).toBe(avant);
  // …et rien de ce qui est parti ne contient un montant ni n'écrit quoi que ce soit.
  for (const r of requetes.filter((x) => x.url.includes('/api/'))) {
    expect(r.methode).toBe('GET');
    expect(r.corps).toBeNull();
    for (const montant of ['637', '600', '250', '200', 'Marie', 'Confidentielle']) {
      expect(r.url, r.url).not.toContain(montant);
    }
  }
});

test('E2E-04 : formulaire de contact → message envoyé et confirmation affichée', async ({
  page,
}) => {
  // On intercepte l'envoi pour ne pas polluer la base ni consommer la limite d'envois ;
  // le vrai POST /api/contact est couvert par les tests d'API (API-07 à API-09).
  let corps = null;
  await page.route('**/api/contact', async (route) => {
    corps = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { message: 'Message envoyé. Merci !' } });
  });

  await page.goto('/contact');
  await page.getByLabel('Objet').fill('Question sur la bourse');
  await page.getByLabel('Votre adresse e-mail').fill('etudiant@exemple.fr');
  await page.getByLabel('Message').fill('Bonjour, comment demander la bourse ?');
  await page.getByRole('button', { name: 'Envoyer' }).click();

  await expect(page.getByRole('status')).toContainText('Message envoyé');
  expect(corps).toEqual({
    objet: 'Question sur la bourse',
    email: 'etudiant@exemple.fr',
    message: 'Bonjour, comment demander la bourse ?',
    siteWeb: '',
  });
});

test('bilan PDF sans aucun montant : message d’erreur, aucun téléchargement', async ({ page }) => {
  await page.goto('/evaluer');
  let telecharge = false;
  page.on('download', () => (telecharge = true));
  await page.getByRole('button', { name: 'Télécharger mon bilan (PDF)' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Renseignez au moins un revenu ou une dépense',
  );
  await expect(page.getByLabel('Job étudiant (net)')).toBeFocused();
  await page.waitForTimeout(800); // laisse le temps à un éventuel téléchargement (qui ne doit pas se produire)
  expect(telecharge).toBe(false);
  // Dès qu'on saisit un montant, le message disparaît et le bilan se télécharge.
  await page.getByLabel('Alimentation').fill('150');
  await expect(page.getByRole('alert')).toHaveCount(0);
  const telechargement = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Télécharger mon bilan (PDF)' }).click();
  expect((await telechargement).suggestedFilename()).toBe('bilan-campuslens.pdf');
});

test('le bilan PDF se télécharge (nom par défaut, sans prénom)', async ({ page }) => {
  await page.goto('/evaluer');
  await remplirBudgetDeReference(page);
  const telechargement = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Télécharger mon bilan (PDF)' }).click();
  const fichier = await telechargement;
  expect(fichier.suggestedFilename()).toBe('bilan-campuslens.pdf');
});

test('avec un prénom : le fichier s’appelle « prénom-mon-budget.pdf » et le PDF porte le nom', async ({
  page,
}) => {
  await page.goto('/evaluer');
  await page.getByLabel('Prénom (facultatif)', { exact: true }).fill('Zoé');
  await page.getByLabel('Nom (facultatif)', { exact: true }).fill('Dupont');
  await remplirBudgetDeReference(page);
  const telechargement = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Télécharger mon bilan (PDF)' }).click();
  const fichier = await telechargement;
  expect(fichier.suggestedFilename()).toBe('zoe-mon-budget.pdf');
  const chemin = await fichier.path();
  const { readFileSync } = await import('node:fs');
  expect(readFileSync(chemin).subarray(0, 5).toString()).toBe('%PDF-'); // un vrai PDF
});

test('les 6 pages se chargent sans erreur de console', async ({ page }) => {
  const erreurs = [];
  page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));
  page.on('pageerror', (e) => erreurs.push(e.message));
  for (const chemin of [
    '/',
    '/evaluer',
    '/aides',
    '/budget',
    '/ressources',
    '/a-propos',
    '/contact',
    '/mentions-legales',
  ]) {
    await page.goto(chemin);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  expect(erreurs).toEqual([]);
});
