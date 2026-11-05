import { test, expect } from '@playwright/test';

// Téléphone (360 px, l'un des plus étroits) : aucune page ne doit dépasser de l'écran, même avec des adresses e-mail,
// des liens et des commentaires très longs. Et une session d'administration terminée ne fait rien perdre.

const LONG_EMAIL =
  'prenom.nom.etudiant.tres.long.adresse@universite-de-la-region-tres-longue.exemple.fr';
const LONG_URL =
  'https://www.service-public.fr/particuliers/vosdroits/F12214?lang=fr&utm_source=newsletter&utm_medium=email&utm_campaign=rentree-2026';
const jour = (i) => `2026-11-0${(i % 5) + 1}T09:30:00Z`;

const debordement = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('Aucun débordement à 360 px', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  for (const chemin of [
    '/',
    '/evaluer',
    '/aides',
    '/aides?onglet=associations',
    '/aides?onglet=villes',
    '/budget',
    '/ressources',
    '/a-propos',
    '/contact',
    '/avis',
    '/mentions-legales',
  ]) {
    test(`page publique ${chemin}`, async ({ page }) => {
      await page.goto(chemin);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(await debordement(page)).toBeLessThanOrEqual(0);
    });
  }

  test('le comparateur de villes défile dans son cadre : la page ne devient pas interminable', async ({
    page,
  }) => {
    await page.goto('/aides?onglet=villes');
    const zone = page.getByRole('region', { name: 'Tableau du comparateur de villes' });
    await expect(zone).toBeVisible();
    const hauteurPage = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(hauteurPage).toBeLessThan(6000); // sans cadre défilant : plus de 50 000 px pour 193 villes
    const defile = await zone.evaluate((e) => e.scrollHeight > e.clientHeight);
    expect(defile).toBe(true);
  });

  test('administration avec des contenus très longs : aucune page ne dépasse', async ({ page }) => {
    const donnees = {
      '/admin/me': { email: LONG_EMAIL, role: 'admin', deuxFacteurs: false },
      '/admin/messages/non-lus': { nombre: 2, avis: 1 },
      '/admin/changements': [
        {
          id: 1,
          resume: 'La page a changé : 178 → 179 €.',
          statut: 'a_valider',
          creeLe: jour(1),
          source: {
            id: 1,
            nom: 'Droits d’inscription nationaux',
            organisme: 'Service-Public.fr',
            url: LONG_URL,
          },
          suggestions: [],
          parametres: [
            {
              id: 12,
              cle: 'droits_inscription',
              niveau: 'master',
              profil: null,
              valeur: 255,
              unite: '€ / an',
            },
          ],
        },
      ],
      '/admin/sources': Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        cle: 'loyers',
        nom: `Source ${i + 1} : abonnements de transport étudiants du réseau urbain de la métropole`,
        organisme: 'Métropole',
        niveau: 3,
        statut: 'erreur',
        aVerifier: true,
        robot: true,
        veille: false,
        verificationManuelle: false,
        frequenceHeures: 168,
        dernierControle: jour(i),
        derniereSynchronisation: {
          statut: 'echec',
          messageErreur: `La source a répondu 403 : ${LONG_URL}`,
        },
        changementsEnAttente: 0,
      })),
      '/admin/historique': Array.from({ length: 12 }, (_, i) => ({
        id: i + 1,
        tableCible: 'tarif_transport',
        ligneId: String(100 + i),
        champ: 'montantMensuel',
        ancienneValeur: '26',
        nouvelleValeur: '12',
        synchronisationId: null,
        changeLe: jour(i),
      })),
      '/admin/messages': Array.from({ length: 3 }, (_, i) => ({
        id: i + 1,
        objet: `Question sur la bourse et le logement CROUS à la rentrée ${i}`,
        email: LONG_EMAIL,
        message: `Voici le lien : ${LONG_URL}\n${'Merci '.repeat(50)}${'x'.repeat(100)}`,
        creeLe: jour(i),
        supprimerApres: '2027-05-05T09:30:00Z',
        luLe: i ? jour(i) : null,
      })),
      '/admin/avis': {
        stats: { total: 3, nonLus: 2, moyenne: 3.7, repartition: { 1: 0, 2: 1, 3: 1, 4: 0, 5: 1 } },
        avis: Array.from({ length: 3 }, (_, i) => ({
          id: i + 1,
          note: i + 3,
          commentaire: `${'Très utile mais je n’ai pas compris le budget '.repeat(6)}${'z'.repeat(100)}`,
          page: 'budget',
          profil: 'intl',
          creeLe: jour(i),
          supprimerApres: '2027-11-03T08:00:00Z',
          luLe: i ? jour(i) : null,
        })),
      },
      '/admin/verification': Array.from({ length: 14 }, (_, i) => ({
        type: 'transport',
        id: i + 1,
        libelle: `Abonnement étudiant ${i + 1} — réseau de transport de l’agglomération`,
        detail: `Mensuel 16 € · annuel 169,60 € · ${LONG_URL}`,
        verifieLe: null,
        source: {
          id: 20 + (i % 3),
          nom: `Tarifs du réseau ${i % 3}`,
          organisme: 'Tisséo',
          url: LONG_URL,
          statut: 'a_verifier',
          frequenceHeures: 720,
        },
      })),
      '/admin/2fa': { actif: false },
    };
    await page.route('**/api/admin/**', (r) => {
      const u = new URL(r.request().url()).pathname.replace('/api', '');
      r.fulfill({ status: 200, json: donnees[u] ?? [] });
    });
    for (const section of [
      'changements',
      'sources',
      'verification',
      'historique',
      'messages',
      'avis',
      'compte',
    ]) {
      await page.goto(`/admin/${section}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(await debordement(page), section).toBeLessThanOrEqual(0);
    }
  });
});

test.describe('Session d’administration terminée', () => {
  test('la reconnexion s’ouvre par-dessus la page : ce qui était saisi est conservé', async ({
    page,
  }) => {
    const compte = { email: 'admin@campuslens.test', role: 'admin', deuxFacteurs: true };
    let session = true;
    await page.route('**/api/admin/**', (r) => {
      const u = new URL(r.request().url()).pathname.replace('/api', '');
      if (u === '/admin/login') {
        session = true;
        return r.fulfill({ status: 200, json: compte });
      }
      if (!session)
        return r.fulfill({
          status: 401,
          json: { error: 'Authentification requise.', code: 'session_expiree' },
        });
      const json =
        u === '/admin/me'
          ? compte
          : u === '/admin/messages/non-lus'
            ? { nombre: 0, avis: 0 }
            : u === '/admin/2fa'
              ? { actif: true }
              : [];
      return r.fulfill({ status: 200, json });
    });
    await page.goto('/admin/compte');
    await page.getByLabel('Mot de passe actuel').fill('ancien-mot-de-passe');
    await page
      .getByLabel('Nouveau mot de passe', { exact: true })
      .fill('Une nouvelle phrase de passe solide');

    session = false; // le serveur ferme la session
    await page.evaluate(() => window.dispatchEvent(new Event('focus'))); // retour sur l'onglet : contrôle immédiat

    const fenetre = page.getByRole('dialog', { name: 'Reconnexion' });
    await expect(fenetre).toBeVisible();
    await expect(fenetre.getByLabel('Adresse e-mail')).toHaveValue(compte.email);
    await fenetre.getByLabel('Mot de passe').fill('le-bon-mot-de-passe');
    await fenetre.getByRole('button', { name: 'Se connecter' }).click();

    await expect(fenetre).toBeHidden();
    await expect(page.getByLabel('Mot de passe actuel')).toHaveValue('ancien-mot-de-passe');
    await expect(page.getByLabel('Nouveau mot de passe', { exact: true })).toHaveValue(
      'Une nouvelle phrase de passe solide',
    );
    expect(new URL(page.url()).pathname).toBe('/admin/compte');
  });
});
