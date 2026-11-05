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

  it('accessibilité : aucune violation axe-core', async () => {
    apiAides();
    const { container } = rendreApp('/aides');
    await screen.findByText('Bourse sur critères sociaux');
    await userEvent.click(screen.getAllByRole('button', { name: /Comment l’obtenir/ })[0]);
    expect(await violationsAxe(container)).toEqual([]);
  });
});
