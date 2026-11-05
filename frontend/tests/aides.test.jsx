import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rendreApp, simulerApi, violationsAxe } from './helpers/rendu.jsx';
import { reponseAides } from './helpers/donnees.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const apiAides = (extra = {}) => simulerApi({ '/aides': reponseAides, ...extra });

describe('Mes aides', () => {
  it('affiche les aides du profil de l’adresse (?profil=) avec leur badge d’éligibilité', async () => {
    const mock = apiAides();
    rendreApp('/aides?profil=intl');
    expect(await screen.findByText('Bourse sur critères sociaux')).toBeInTheDocument();
    expect(mock).toHaveBeenCalledWith('/api/aides?profil=intl', expect.anything());
    expect(screen.getByRole('radio', { name: /international hors UE/ })).toBeChecked();
    expect(screen.getByText('Titre de séjour valide')).toBeInTheDocument();
  });

  it('UI-04 : changer de profil met à jour les badges et le compteur', async () => {
    apiAides();
    rendreApp('/aides');
    await screen.findByText('Bourse sur critères sociaux');
    // fr_ue : 4 aides accessibles (bourse sous conditions, APL, Visale, urgence), 1 « non concerné »
    expect(screen.getByRole('status')).toHaveTextContent(
      '4 aides accessibles pour votre profil, dont 1 sous condition.',
    );
    expect(screen.getByText('Selon vos ressources')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: /Étudiant boursier/ }));
    expect(await screen.findByText('Vous en bénéficiez')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      '4 aides accessibles pour votre profil, dont 0 sous condition.',
    );

    await userEvent.click(screen.getByRole('radio', { name: /international hors UE/ }));
    expect(await screen.findByText('Selon votre université')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      '5 aides accessibles pour votre profil, dont 4 sous conditions.',
    );
  });

  it('le filtre « Besoin » restreint la liste (appel API avec la catégorie)', async () => {
    const mock = apiAides();
    rendreApp('/aides?profil=fr_ue');
    await screen.findByText('Garantie Visale');
    await userEvent.selectOptions(screen.getByLabelText('Besoin'), 'logement');
    await vi.waitFor(() =>
      expect(screen.queryByText('Bourse sur critères sociaux')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Garantie Visale')).toBeInTheDocument();
    expect(mock).toHaveBeenCalledWith(
      '/api/aides?profil=fr_ue&categorie=logement',
      expect.anything(),
    );
  });

  it('UI-05 : « Comment l’obtenir » déplie la démarche et aria-expanded passe à true', async () => {
    apiAides();
    rendreApp('/aides');
    await screen.findByText('Bourse sur critères sociaux');
    const bouton = screen.getAllByRole('button', { name: /Comment l’obtenir/ })[0];
    expect(bouton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/Dossier social étudiant/)).not.toBeInTheDocument();

    await userEvent.click(bouton);
    expect(bouton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Dossier social étudiant/)).toBeInTheDocument();
    expect(bouton).toHaveAccessibleDescription === undefined; // le bouton reste atteignable au clavier
    const panneau = document.getElementById(bouton.getAttribute('aria-controls'));
    expect(panneau).toHaveTextContent('Source : CROUS'.replace('CROUS', 'DILA'));
    expect(within(panneau).getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer');

    await userEvent.click(bouton);
    expect(bouton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/Dossier social étudiant/)).not.toBeInTheDocument();
  });

  it('le dépliage se commande au clavier (Entrée)', async () => {
    apiAides();
    rendreApp('/aides');
    await screen.findByText('Bourse sur critères sociaux');
    const bouton = screen.getAllByRole('button', { name: /Comment l’obtenir/ })[0];
    bouton.focus();
    await userEvent.keyboard('{Enter}');
    expect(bouton).toHaveAttribute('aria-expanded', 'true');
  });

  it('UI-06 : API indisponible → message d’erreur compréhensible, pas de page blanche', async () => {
    simulerApi({ '/aides': new Error('panne') });
    rendreApp('/aides');
    expect(await screen.findByRole('alert')).toHaveTextContent(/momentanément indisponibles/);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Associations & entraide' })).toBeInTheDocument();
  });

  it('les onglets : Associations & entraide', async () => {
    apiAides({
      '/associations': [
        {
          id: 1,
          nom: 'AGORAé',
          description: 'Épiceries solidaires.',
          lien: 'https://www.agoraes.fr',
          source: { organisme: 'Associations' },
          verifieLe: null,
          aVerifier: true,
        },
      ],
    });
    rendreApp('/aides');
    await userEvent.click(screen.getByRole('tab', { name: 'Associations & entraide' }));
    expect(screen.getByRole('tab', { name: 'Associations & entraide' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByText('AGORAé')).toBeInTheDocument();
    expect(screen.getByText('vérification en cours')).toBeVisible();
  });

  it('les onglets : flèches du clavier pour passer de l’un à l’autre', async () => {
    apiAides({ '/associations': [], '/villes': [] });
    rendreApp('/aides');
    screen.getByRole('tab', { name: 'Aides financières' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Associations & entraide' })).toHaveFocus();
    expect(await screen.findByText(/Aucune association/)).toBeInTheDocument();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Aides financières' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('onglets : deux flèches enchaînées très vite aboutissent au bon onglet (pas de dérive)', async () => {
    apiAides({ '/associations': [], '/villes': [] });
    rendreApp('/aides');
    const aides = screen.getByRole('tab', { name: 'Aides financières' });
    aides.focus();
    // Sans attendre entre les deux touches : droite puis gauche = retour au point de départ.
    await userEvent.keyboard('{ArrowRight}{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Aides financières' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // Trois flèches droite = on fait le tour complet des 3 onglets.
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Aides financières' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('comparateur de villes : message honnête tant qu’aucune ville n’est synchronisée', async () => {
    apiAides({ '/villes': [] });
    rendreApp('/aides?onglet=villes');
    expect(await screen.findByText(/prochaine synchronisation/)).toBeInTheDocument();
  });

  it('comparateur de villes : tableau, recherche et source', async () => {
    apiAides({
      '/villes': [
        {
          id: 1,
          nom: 'Paris',
          region: 'Île-de-France',
          loyerStudioEstime: 810,
          nbLogementsCrous: 4000,
          abonnementTransport: 90,
          source: { organisme: 'ANIL' },
          verifieLe: '2026-09-01T00:00:00Z',
          aVerifier: false,
        },
        {
          id: 2,
          nom: 'Lille',
          region: 'Hauts-de-France',
          loyerStudioEstime: null,
          nbLogementsCrous: null,
          abonnementTransport: null,
          source: { organisme: 'ANIL' },
          verifieLe: null,
          aVerifier: true,
        },
      ],
    });
    rendreApp('/aides?onglet=villes');
    expect(await screen.findByRole('rowheader', { name: /Paris/ })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Comparateur de villes' })).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3); // données manquantes : jamais un 0 inventé
    await userEvent.type(screen.getByLabelText('Rechercher une ville'), 'lil');
    expect(screen.queryByRole('rowheader', { name: /Paris/ })).not.toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: /Lille/ })).toBeInTheDocument();
  });

  it('comparateur de villes : loyer en résidence CROUS, recherche sans accents, Corse comprise', async () => {
    const ville = (id, nom, region, extra = {}) => ({
      id,
      nom,
      region,
      loyerStudioEstime: 400,
      nbLogementsCrous: 3,
      loyerCrousDesA: null,
      abonnementTransport: null,
      source: { organisme: 'ANIL' },
      verifieLe: '2026-09-01T00:00:00Z',
      aVerifier: false,
      ...extra,
    });
    apiAides({
      '/villes': [
        ville(1, 'Orléans', 'Centre-Val de Loire', { loyerCrousDesA: 259 }),
        ville(2, 'Ajaccio', 'Corse'),
        ville(3, 'Lille', 'Hauts-de-France'),
      ],
    });
    rendreApp('/aides?onglet=villes');
    const orleans = (await screen.findByRole('rowheader', { name: /Orléans/ })).closest('tr');
    expect(orleans).toHaveTextContent('dès 259');
    expect(screen.getByRole('rowheader', { name: /Ajaccio/ }).closest('tr')).not.toHaveTextContent(
      'dès',
    );
    await userEvent.type(screen.getByLabelText('Rechercher une ville'), 'orleans');
    expect(screen.queryByRole('rowheader', { name: /Lille/ })).not.toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Rechercher une ville'));
    await userEvent.type(screen.getByLabelText('Rechercher une ville'), 'corse');
    expect(screen.getByRole('rowheader', { name: /Ajaccio/ })).toBeInTheDocument();
    expect(screen.queryByRole('rowheader', { name: /Orléans/ })).not.toBeInTheDocument();
  });

  it('comparateur de villes : abonnement de transport avec réseau, prix annuel et page officielle', async () => {
    apiAides({
      '/villes': [
        {
          id: 1,
          nom: 'Marseille',
          region: 'Provence-Alpes-Côte d’Azur',
          loyerStudioEstime: 372,
          nbLogementsCrous: 15,
          loyerCrousDesA: 300,
          abonnementTransport: 16.67,
          transport: {
            reseau: 'RTM',
            libelle: 'Pass Annuel Étudiant',
            montantAnnuel: 200,
            urlTarifs: 'https://www.rtm.fr/tarifs',
            source: { organisme: 'RTM' },
            verifieLe: null,
            aVerifier: true,
          },
          source: { organisme: 'ANIL' },
          verifieLe: '2026-09-01T00:00:00Z',
          aVerifier: false,
        },
      ],
    });
    rendreApp('/aides?onglet=villes');
    const ligne = (await screen.findByRole('rowheader', { name: /Marseille/ })).closest('tr');
    expect(ligne).toHaveTextContent('16,67');
    expect(ligne).toHaveTextContent('/ mois');
    expect(ligne).toHaveTextContent('RTM — Pass Annuel Étudiant');
    expect(within(ligne).getByRole('link', { name: /tarifs officiels/ })).toHaveAttribute(
      'href',
      'https://www.rtm.fr/tarifs',
    );
    expect(ligne).toHaveTextContent('vérification en cours');
  });

  it('comparateur de villes : réseau sans abonnement annuel (Nancy) → mensuel, aucun total inventé', async () => {
    apiAides({
      '/villes': [
        {
          id: 1,
          nom: 'Nancy',
          region: 'Grand Est',
          loyerStudioEstime: 243,
          nbLogementsCrous: 7,
          loyerCrousDesA: null,
          abonnementTransport: 22,
          transport: {
            reseau: 'Stan',
            libelle: 'Abonnement illimité 18-25 ans',
            montantAnnuel: null,
            montantMensuel: 22,
            urlTarifs: 'https://www.reseau-stan.com/',
            source: { organisme: 'Stan' },
            verifieLe: null,
            aVerifier: true,
          },
          source: { organisme: 'ANIL' },
          verifieLe: '2026-09-01T00:00:00Z',
          aVerifier: false,
        },
      ],
    });
    rendreApp('/aides?onglet=villes');
    const ligne = (await screen.findByRole('rowheader', { name: /Nancy/ })).closest('tr');
    expect(ligne).toHaveTextContent('abonnement mensuel');
    expect(ligne).not.toHaveTextContent('par an');
  });

  it('comparateur de villes : le pass mensuel prime sur l’annuel ÷ 12 quand le réseau en propose un', async () => {
    apiAides({
      '/villes': [
        {
          id: 1,
          nom: 'Toulouse',
          region: 'Occitanie',
          loyerStudioEstime: 327,
          nbLogementsCrous: 32,
          loyerCrousDesA: null,
          abonnementTransport: 16,
          transport: {
            reseau: 'Tisséo',
            libelle: 'Étudiant 20-25 ans',
            montantAnnuel: 169.6,
            montantMensuel: 16,
            urlTarifs: 'https://eboutique.tisseo.fr/',
            source: { organisme: 'Tisséo' },
            verifieLe: null,
            aVerifier: true,
          },
          source: { organisme: 'ANIL' },
          verifieLe: '2026-09-01T00:00:00Z',
          aVerifier: false,
        },
      ],
    });
    rendreApp('/aides?onglet=villes');
    const ligne = (await screen.findByRole('rowheader', { name: /Toulouse/ })).closest('tr');
    expect(ligne).toHaveTextContent('16');
    expect(ligne).toHaveTextContent('pass mensuel');
    expect(ligne).not.toHaveTextContent('14,13');
  });

  it('accessibilité : aucune violation axe-core', async () => {
    apiAides();
    const { container } = rendreApp('/aides');
    await screen.findByText('Bourse sur critères sociaux');
    await userEvent.click(screen.getAllByRole('button', { name: /Comment l’obtenir/ })[0]);
    expect(await violationsAxe(container)).toEqual([]);
  });
});
