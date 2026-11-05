import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rendreApp, simulerApi, violationsAxe } from './helpers/rendu.jsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.head.querySelectorAll('meta[name="robots"]').forEach((m) => m.remove());
});

const CHANGEMENT = {
  id: 7,
  statut: 'a_valider',
  resume:
    'La page « Droits d’inscription nationaux » a changé. Valeurs repérées : droits_inscription (master) = 256 (actuel : 255).',
  source: {
    id: 1,
    nom: 'Droits d’inscription nationaux (Service-Public)',
    organisme: 'Service-Public.fr',
    url: 'https://www.service-public.fr/particuliers/actualites/A14725',
  },
  suggestions: [
    {
      parametreId: 12,
      cle: 'droits_inscription',
      niveau: 'master',
      valeurActuelle: 255,
      valeur: 256,
    },
  ],
  parametres: [
    {
      id: 11,
      cle: 'droits_inscription',
      niveau: 'licence',
      profil: null,
      valeur: 178,
      unite: '€ / an',
    },
    {
      id: 12,
      cle: 'droits_inscription',
      niveau: 'master',
      profil: null,
      valeur: 255,
      unite: '€ / an',
    },
  ],
};
const SOURCES = [
  {
    id: 1,
    cle: 'droits',
    nom: 'Droits d’inscription nationaux (Service-Public)',
    organisme: 'Service-Public.fr',
    niveau: 3,
    statut: 'ok',
    aVerifier: false,
    robot: true,
    frequenceHeures: 168,
    dernierControle: '2026-11-05T10:00:00Z',
    derniereSynchronisation: {
      statut: 'en_attente_validation',
      nbChangements: 1,
      messageErreur: null,
    },
    changementsEnAttente: 1,
  },
  {
    id: 2,
    cle: 'loyers',
    nom: 'Carte des loyers',
    organisme: 'ANIL',
    niveau: 1,
    statut: 'erreur',
    aVerifier: true,
    robot: true,
    frequenceHeures: 168,
    dernierControle: null,
    derniereSynchronisation: { statut: 'echec', messageErreur: 'La source a répondu 500' },
    changementsEnAttente: 0,
  },
  {
    id: 3,
    cle: null,
    nom: 'Indicateur du coût de la rentrée',
    organisme: 'FAGE',
    niveau: 3,
    statut: 'a_verifier',
    aVerifier: true,
    robot: false,
    frequenceHeures: 720,
    dernierControle: null,
    derniereSynchronisation: null,
    changementsEnAttente: 0,
  },
];
const HISTORIQUE = [
  {
    id: 9,
    tableCible: 'parametre',
    ligneId: '12',
    champ: 'valeur',
    ancienneValeur: '254',
    nouvelleValeur: '255',
    synchronisationId: 3,
    changeLe: '2026-11-05T10:00:00Z',
  },
];

const connecte = (role = 'admin', extra = {}) =>
  simulerApi({
    '/admin/me': { email: 'admin@campuslens.test', role },
    '/admin/changements': [CHANGEMENT],
    '/admin/sources': SOURCES,
    '/admin/historique': HISTORIQUE,
    ...extra,
  });

describe('Espace administration', () => {
  it('non connecté (401) → formulaire de connexion, et aucun lien vers /admin dans la navigation publique', async () => {
    simulerApi({ '/admin/me': { __status: 401, corps: { error: 'Authentification requise.' } } });
    rendreApp('/admin');
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation', { name: 'Navigation principale' })).queryByText(
        /admin/i,
      ),
    ).not.toBeInTheDocument();
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    );
  });

  it('connexion : envoie e-mail et mot de passe, puis affiche le tableau de bord', async () => {
    const mock = simulerApi({
      '/admin/me': { __status: 401 },
      '/admin/login': { email: 'admin@campuslens.test', role: 'admin' },
      '/admin/changements': [],
    });
    rendreApp('/admin');
    await userEvent.type(await screen.findByLabelText('Adresse e-mail'), 'admin@campuslens.test');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'un-mot-de-passe');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByText(/Connecté :/)).toHaveTextContent('admin@campuslens.test');
    const appel = mock.mock.calls.find(([u]) => u === '/api/admin/login');
    expect(appel[1].method).toBe('POST');
    expect(JSON.parse(appel[1].body)).toEqual({
      email: 'admin@campuslens.test',
      motDePasse: 'un-mot-de-passe',
    });
  });

  it('mauvais mot de passe → message clair ; blocage temporaire (429) → message dédié', async () => {
    simulerApi({
      '/admin/me': { __status: 401 },
      '/admin/login': { __status: 401, corps: { error: 'Identifiants incorrects.' } },
    });
    rendreApp('/admin');
    await userEvent.type(await screen.findByLabelText('Adresse e-mail'), 'a@b.fr');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'faux');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Identifiants incorrects.');
    cleanup();

    simulerApi({ '/admin/me': { __status: 401 }, '/admin/login': { __status: 429, corps: {} } });
    rendreApp('/admin');
    await userEvent.type(await screen.findByLabelText('Adresse e-mail'), 'a@b.fr');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'faux');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Trop de tentatives/);
  });

  it('E2E-05 (composant) : valider un changement envoie la valeur corrigée par l’admin, puis recharge la liste', async () => {
    let valide = false;
    const mock = connecte('admin', {
      '/admin/changements': () => (valide ? [] : [CHANGEMENT]),
      '/admin/changements/7/valider': () => {
        valide = true;
        return { statut: 'valide', valeursModifiees: 1 };
      },
    });
    rendreApp('/admin');
    const carte = (
      await screen.findByRole('heading', { name: /Droits d’inscription nationaux/ })
    ).closest('li');
    // Le formulaire est pré-rempli avec la valeur PROPOSÉE par le robot, et la valeur actuelle est rappelée.
    expect(within(carte).getByLabelText('Droits d’inscription (master)')).toHaveValue('256');
    expect(within(carte).getByLabelText('Droits d’inscription (licence)')).toHaveValue('178');
    expect(within(carte).getByText(/actuelle : 255/)).toBeInTheDocument();
    expect(within(carte).getByText('proposée : 256')).toBeInTheDocument();

    await userEvent.click(within(carte).getByRole('button', { name: /^Valider/ }));
    expect(await screen.findByText(/Aucun changement à valider/)).toBeInTheDocument();
    const appel = mock.mock.calls.find(([u]) => u === '/api/admin/changements/7/valider');
    expect(appel[1].method).toBe('POST');
    // Seule la valeur réellement différente de la base est envoyée.
    expect(JSON.parse(appel[1].body)).toEqual({ valeurs: [{ parametreId: 12, valeur: 256 }] });
  });

  it('l’admin peut corriger la valeur proposée avant de valider (virgule française acceptée)', async () => {
    const mock = connecte();
    rendreApp('/admin');
    const champ = await screen.findByLabelText('Droits d’inscription (master)');
    await userEvent.clear(champ);
    await userEvent.type(champ, '257,5');
    await userEvent.click(screen.getByRole('button', { name: /^Valider/ }));
    await vi.waitFor(() =>
      expect(mock.mock.calls.some(([u]) => u.endsWith('/valider'))).toBe(true),
    );
    const corps = JSON.parse(mock.mock.calls.find(([u]) => u.endsWith('/valider'))[1].body);
    expect(corps.valeurs).toEqual([{ parametreId: 12, valeur: 257.5 }]);
  });

  it('une valeur non numérique désactive la validation', async () => {
    connecte();
    rendreApp('/admin');
    const champ = await screen.findByLabelText('Droits d’inscription (master)');
    await userEvent.clear(champ);
    await userEvent.type(champ, 'abc');
    expect(screen.getByRole('button', { name: /^Valider/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Rejeter/ })).toBeEnabled();
  });

  it('rejeter un changement : POST sans valeur, la liste se vide', async () => {
    let rejete = false;
    const mock = connecte('relecteur', {
      '/admin/changements': () => (rejete ? [] : [CHANGEMENT]),
      '/admin/changements/7/rejeter': () => {
        rejete = true;
        return { statut: 'rejete' };
      },
    });
    rendreApp('/admin');
    await userEvent.click(await screen.findByRole('button', { name: /^Rejeter/ }));
    expect(await screen.findByText(/Aucun changement à valider/)).toBeInTheDocument();
    expect(JSON.parse(mock.mock.calls.find(([u]) => u.endsWith('/rejeter'))[1].body)).toEqual({});
  });

  it('erreur à la validation (déjà traité) → message, pas de plantage', async () => {
    connecte('admin', {
      '/admin/changements/7/valider': {
        __status: 409,
        corps: { error: 'Ce changement a déjà été traité.' },
      },
    });
    rendreApp('/admin');
    await userEvent.click(await screen.findByRole('button', { name: /^Valider/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('déjà été traité');
  });

  it('état des sources : statut, dernier passage, message d’erreur ; lancer un robot (admin)', async () => {
    const mock = connecte('admin', {
      '/admin/sources/2/synchroniser': { statut: 'succes', nbChangements: 3 },
    });
    rendreApp('/admin');
    await userEvent.click(await screen.findByRole('tab', { name: 'État des sources' }));
    const tableau = await screen.findByRole('table', { name: 'État des sources de données' });
    const ligne = (nom) =>
      within(tableau)
        .getByRole('rowheader', { name: new RegExp(nom) })
        .closest('tr');
    expect(ligne('Carte des loyers')).toHaveTextContent('En erreur');
    expect(ligne('Carte des loyers')).toHaveTextContent('La source a répondu 500');
    expect(ligne('Droits d’inscription')).toHaveTextContent('À jour');
    expect(ligne('Droits d’inscription')).toHaveTextContent('En attente de validation');
    expect(ligne('Indicateur du coût')).toHaveTextContent('Pas de robot');
    expect(within(ligne('Indicateur du coût')).queryByRole('button')).not.toBeInTheDocument();

    await userEvent.click(
      within(ligne('Carte des loyers')).getByRole('button', { name: /Lancer/ }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Carte des loyers : Réussie');
    expect(
      mock.mock.calls.some(
        ([u, o]) => u === '/api/admin/sources/2/synchroniser' && o.method === 'POST',
      ),
    ).toBe(true);
  });

  it('le rôle « relecteur » ne voit ni « Lancer » ni « Annuler »', async () => {
    connecte('relecteur');
    rendreApp('/admin');
    await userEvent.click(await screen.findByRole('tab', { name: 'État des sources' }));
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /Lancer/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Historique' }));
    await screen.findByRole('table', { name: 'Dernières modifications de données' });
    expect(screen.queryByRole('button', { name: /Annuler/ })).not.toBeInTheDocument();
  });

  it('historique : annuler une modification (admin) restaure la valeur', async () => {
    const mock = connecte('admin', { '/admin/historique/9/annuler': { restauree: '254' } });
    rendreApp('/admin');
    await userEvent.click(await screen.findByRole('tab', { name: 'Historique' }));
    const tableau = await screen.findByRole('table', {
      name: 'Dernières modifications de données',
    });
    expect(within(tableau).getByText('254')).toBeInTheDocument();
    expect(within(tableau).getByText('Robot (passage 3)')).toBeInTheDocument();
    await userEvent.click(within(tableau).getByRole('button', { name: /Annuler/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('Valeur restaurée : 254.');
    expect(mock.mock.calls.some(([u]) => u === '/api/admin/historique/9/annuler')).toBe(true);
  });

  it('déconnexion : retour au formulaire de connexion', async () => {
    connecte();
    rendreApp('/admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Se déconnecter' }));
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
  });

  it('API indisponible pendant la vérification de session → message clair', async () => {
    simulerApi({ '/admin/me': new Error('panne') });
    rendreApp('/admin');
    expect(await screen.findByRole('alert')).toHaveTextContent(/momentanément indisponibles/);
  });

  it('accessibilité : aucune violation axe-core (connexion, changements, sources, historique)', async () => {
    simulerApi({ '/admin/me': { __status: 401 } });
    const a = rendreApp('/admin');
    await screen.findByRole('heading', { name: 'Connexion' });
    expect(await violationsAxe(a.container)).toEqual([]);
    cleanup();

    connecte();
    const b = rendreApp('/admin');
    await screen.findByLabelText('Droits d’inscription (master)');
    expect(await violationsAxe(b.container)).toEqual([]);
    await userEvent.click(screen.getByRole('tab', { name: 'État des sources' }));
    await screen.findByRole('table');
    expect(await violationsAxe(b.container)).toEqual([]);
    await userEvent.click(screen.getByRole('tab', { name: 'Historique' }));
    await screen.findByRole('table', { name: 'Dernières modifications de données' });
    expect(await violationsAxe(b.container)).toEqual([]);
  });
});
