import { test, expect } from '@playwright/test';

async function remplirBudget(page) {
  const champs = {
    'Job étudiant (net)': '600',
    'Aide de la famille': '250',
    'Loyer charges comprises': '637',
    Alimentation: '200',
  };
  for (const [libelle, valeur] of Object.entries(champs))
    await page.getByLabel(libelle).fill(valeur);
}

async function remplirEstimation(page) {
  await page.getByText('Estimer mon aide au logement').first().click();
  const formulaire = page.getByRole('form', { name: 'Estimation de l’aide au logement' });
  await formulaire.getByLabel('Ville où vous étudiez').selectOption({ label: 'Rennes' });
  await formulaire.getByLabel('Votre âge').fill('20');
  return formulaire;
}

test('estimation facultative : rien ne part avant le clic, puis exactement 5 informations (moteur simulé)', async ({
  page,
}) => {
  const envois = [];
  await page.route('**/api/simulation/aides-estimees', async (route) => {
    envois.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      json: {
        periode: '2026-11',
        aides: [
          {
            slug: 'aide-logement-apl-als',
            nom: 'Aide au logement (APL / ALS)',
            codeOpenfisca: 'aide_logement',
            montantMensuel: 199.88,
            details: { apl: 0, als: 199.88 },
          },
        ],
        moteur: { nom: 'OpenFisca France', version: '175.0.45' },
        source: { organisme: 'OpenFisca', statut: 'ok' },
        verifieLe: '2026-11-05T14:00:00.000Z',
        aVerifier: false,
        avertissement: 'Estimation indicative.',
      },
    });
  });

  await page.goto('/evaluer');
  await remplirBudget(page);
  const formulaire = await remplirEstimation(page);
  expect(envois).toHaveLength(0); // formulaire rempli, bouton pas encore cliqué
  await formulaire.getByRole('button', { name: 'Estimer mon aide au logement' }).click();

  await expect(formulaire.getByText(/≈\s200\s€\spar\smois/)).toBeVisible();
  expect(envois).toEqual([
    { age: 20, ville: '35238', loyer: 637, typeLogement: 'vide', revenu: 600 },
  ]);
});

// Test RÉEL contre l'API publique OpenFisca : lancé seulement à la demande (E2E_LIVE=1), pour que la CI
// ne dépende pas d'un service externe. Il vérifie toute la chaîne : site → notre API → OpenFisca.
test('estimation réelle via OpenFisca (E2E_LIVE=1)', async ({ page }) => {
  test.skip(!process.env.E2E_LIVE, 'Test en ligne : définir E2E_LIVE=1 pour le lancer');
  test.setTimeout(60_000);
  await page.goto('/evaluer');
  await remplirBudget(page);
  const formulaire = await remplirEstimation(page);
  await formulaire.getByRole('button', { name: 'Estimer mon aide au logement' }).click();
  await expect(formulaire.getByText(/≈\s\d+\s€\spar\smois/)).toBeVisible({ timeout: 45_000 });
  await expect(formulaire).toContainText('OpenFisca France');
  await expect(formulaire).toContainText('ne remplace pas la simulation officielle de la CAF');
});
