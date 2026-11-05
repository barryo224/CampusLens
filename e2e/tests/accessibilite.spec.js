import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Contrôle d'accessibilité dans un VRAI navigateur (couleurs, contrastes, focus réels) :
// ce que les tests de composants (jsdom) ne peuvent pas mesurer. Règles WCAG 2.0/2.1 niveaux A et AA.
const analyser = (page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    .analyze();

const resume = (violations) =>
  violations.map(
    (v) =>
      `${v.impact} · ${v.id} : ${v.help} → ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' '))
        .join(' | ')}`,
  );

const PAGES_PUBLIQUES = [
  ['Accueil', '/'],
  ['Évaluer ma situation', '/evaluer'],
  ['Mes aides', '/aides'],
  ['Mes aides — associations', '/aides?onglet=associations'],
  ['Mes aides — comparateur de villes', '/aides?onglet=villes'],
  ['Préparer mon budget', '/budget'],
  ['Ressources', '/ressources'],
  ['À propos', '/a-propos'],
  ['Contact', '/contact'],
  ['Mentions légales', '/mentions-legales'],
];

for (const [nom, chemin] of PAGES_PUBLIQUES) {
  test(`axe-core : ${nom} (aucune violation, contrastes réels compris)`, async ({ page }) => {
    await page.goto(chemin);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(resume((await analyser(page)).violations)).toEqual([]);
  });
}

test('axe-core : simulateur rempli, résultat négatif, estimation OpenFisca ouverte', async ({
  page,
}) => {
  await page.goto('/evaluer');
  for (const [l, v] of Object.entries({
    'Job étudiant (net)': '600',
    'Aide de la famille': '250',
    'Loyer charges comprises': '637',
    Alimentation: '200',
  })) {
    await page.getByLabel(l).fill(v);
  }
  await page.getByText('Étudiant international hors UE').click();
  await page.getByText('Estimer mon aide au logement').first().click();
  await expect(page.getByRole('form', { name: 'Estimation de l’aide au logement' })).toBeVisible();
  expect(resume((await analyser(page)).violations)).toEqual([]);
});

test('axe-core : aide dépliée et profil international', async ({ page }) => {
  await page.goto('/aides?profil=intl');
  await page
    .getByRole('button', { name: /Comment l’obtenir/ })
    .first()
    .click();
  expect(resume((await analyser(page)).violations)).toEqual([]);
});

test('axe-core : formulaire de contact avec erreur affichée', async ({ page }) => {
  await page.route('**/api/contact', (r) => r.fulfill({ status: 429, json: { error: 'x' } }));
  await page.goto('/contact');
  await page.getByLabel('Objet').fill('Test');
  await page.getByLabel('Votre adresse e-mail').fill('a@b.fr');
  await page.getByLabel('Message').fill('Bonjour');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(resume((await analyser(page)).violations)).toEqual([]);
});

test.describe('administration (réponses simulées)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/admin/me', (r) =>
      r.fulfill({ json: { email: 'admin@campuslens.test', role: 'admin' } }),
    );
    await page.route('**/api/admin/changements', (r) =>
      r.fulfill({
        json: [
          {
            id: 1,
            statut: 'a_valider',
            resume: 'La page a changé.',
            source: {
              id: 1,
              nom: 'Droits d’inscription',
              organisme: 'Service-Public.fr',
              url: 'https://www.service-public.fr',
            },
            suggestions: [{ parametreId: 5, valeurActuelle: 255, valeur: 256 }],
            parametres: [
              {
                id: 5,
                cle: 'droits_inscription',
                niveau: 'master',
                profil: null,
                valeur: 255,
                unite: '€ / an',
              },
            ],
          },
        ],
      }),
    );
    await page.route('**/api/admin/sources', (r) =>
      r.fulfill({
        json: [
          {
            id: 1,
            cle: 'loyers',
            nom: 'Carte des loyers',
            organisme: 'ANIL',
            niveau: 1,
            statut: 'erreur',
            robot: true,
            frequenceHeures: 168,
            dernierControle: '2026-11-05T10:00:00Z',
            derniereSynchronisation: { statut: 'echec', messageErreur: 'La source a répondu 500' },
            changementsEnAttente: 0,
          },
        ],
      }),
    );
    await page.route('**/api/admin/historique', (r) =>
      r.fulfill({
        json: [
          {
            id: 1,
            tableCible: 'parametre',
            ligneId: '5',
            champ: 'valeur',
            ancienneValeur: '254',
            nouvelleValeur: '255',
            synchronisationId: 1,
            changeLe: '2026-11-05T10:00:00Z',
          },
        ],
      }),
    );
    await page.route('**/api/admin/messages', (r) =>
      r.fulfill({
        json: [
          {
            id: 1,
            objet: 'Question',
            email: 'a@b.fr',
            message: 'Bonjour',
            creeLe: '2026-11-05T10:00:00Z',
            supprimerApres: '2027-05-05T10:00:00Z',
          },
        ],
      }),
    );
  });
  for (const [nom, chemin] of [
    ['À valider', '/admin/changements'],
    ['État des sources', '/admin/sources'],
    ['Historique', '/admin/historique'],
    ['Messages', '/admin/messages'],
  ]) {
    test(`axe-core : admin — ${nom}`, async ({ page }) => {
      await page.goto(chemin);
      await expect(
        page.getByRole('navigation', { name: 'Sections de l’administration' }),
      ).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(resume((await analyser(page)).violations)).toEqual([]);
    });
  }
  test('axe-core : admin — connexion', async ({ page }) => {
    await page.unroute('**/api/admin/me');
    await page.route('**/api/admin/me', (r) => r.fulfill({ status: 401, json: { error: 'x' } }));
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
    expect(resume((await analyser(page)).violations)).toEqual([]);
  });
});
