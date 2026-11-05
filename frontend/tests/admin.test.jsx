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

const MESSAGES = [
  {
    id: 4,
    objet: 'Question sur la bourse',
    email: 'etudiant@exemple.fr',
    message: 'Bonjour,\ncomment demander la bourse ?',
    creeLe: '2026-11-05T09:30:00Z',
    supprimerApres: '2027-05-05T09:30:00Z',
    luLe: null,
  },
  {
    id: 3,
    objet: 'Erreur sur une aide',
    email: 'autre@exemple.fr',
    message: '<script>alert(1)</script> Le lien est cassé.',
    creeLe: '2026-11-04T08:00:00Z',
    supprimerApres: '2027-05-04T08:00:00Z',
  },
];

const connecte = (role = 'admin', extra = {}) =>
  simulerApi({
    '/admin/me': { email: 'admin@campuslens.test', role },
    '/admin/changements': [CHANGEMENT],
    '/admin/sources': SOURCES,
    '/admin/historique': HISTORIQUE,
    '/admin/messages': MESSAGES,
    '/admin/messages/non-lus': { nombre: 2 },
    ...extra,
  });

describe('Espace administration', () => {
  it('non connecté (401) → formulaire de connexion, sans le menu du site public', async () => {
    simulerApi({ '/admin/me': { __status: 401, corps: { error: 'Authentification requise.' } } });
    rendreApp('/admin');
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Sections de l’administration' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Navigation principale' }),
    ).not.toBeInTheDocument();
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    );
  });

  it('le site public ne contient aucun lien vers l’administration', async () => {
    simulerApi({ '/aides': [] });
    rendreApp('/');
    expect(document.querySelector('a[href^="/admin"]')).toBeNull();
  });

  it('l’espace admin a sa propre mise en page : pas de menu public, mais un lien « Voir le site »', async () => {
    connecte();
    rendreApp('/admin');
    await screen.findByRole('navigation', { name: 'Sections de l’administration' });
    expect(
      screen.queryByRole('navigation', { name: 'Navigation principale' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Évaluer ma situation' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir le site' })).toHaveAttribute('href', '/');
    expect(screen.getByText(/admin@campuslens.test \(admin\)/)).toBeInTheDocument();
  });

  it('/admin ouvre « À valider » ; chaque section a sa propre adresse (conservée au rechargement)', async () => {
    connecte();
    rendreApp('/admin');
    const nav = await screen.findByRole('navigation', { name: 'Sections de l’administration' });
    // Après la redirection automatique de /admin vers /admin/changements :
    await vi.waitFor(() =>
      expect(within(nav).getByRole('link', { name: 'À valider' })).toHaveAttribute(
        'aria-current',
        'page',
      ),
    );
    expect(within(nav).getByRole('link', { name: 'État des sources' })).toHaveAttribute(
      'href',
      '/admin/sources',
    );
    expect(within(nav).getByRole('link', { name: 'Historique' })).toHaveAttribute(
      'href',
      '/admin/historique',
    );
    expect(within(nav).getByRole('link', { name: /^Messages/ })).toHaveAttribute(
      'href',
      '/admin/messages',
    );
    cleanup();

    // Ouvrir directement /admin/sources (comme après un rechargement de la page) affiche cette section.
    connecte();
    rendreApp('/admin/sources');
    expect(
      await screen.findByRole('table', { name: 'État des sources de données' }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation', { name: 'Sections de l’administration' })).getByRole(
        'link',
        { name: 'État des sources' },
      ),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('naviguer entre les sections ne déconnecte pas et ne refait pas de connexion', async () => {
    const mock = connecte();
    rendreApp('/admin');
    await userEvent.click(await screen.findByRole('link', { name: 'État des sources' }));
    await screen.findByRole('table', { name: 'État des sources de données' });
    await userEvent.click(screen.getByRole('link', { name: 'Historique' }));
    await screen.findByRole('table', { name: 'Dernières modifications de données' });
    await userEvent.click(screen.getByRole('link', { name: 'À valider' }));
    await screen.findByRole('heading', { name: /Droits d’inscription nationaux/ });
    expect(screen.queryByRole('heading', { name: 'Connexion' })).not.toBeInTheDocument();
    expect(mock.mock.calls.filter(([u]) => u === '/api/admin/me')).toHaveLength(1); // une seule vérification de session
  });

  it('adresse inconnue dans /admin → retour à « À valider »', async () => {
    connecte();
    rendreApp('/admin/nimporte-quoi');
    expect(
      await screen.findByRole('heading', { name: /Droits d’inscription nationaux/ }),
    ).toBeInTheDocument();
  });

  it('non connecté sur /admin/sources : connexion, puis on arrive directement sur cette section', async () => {
    let connecteMaintenant = false;
    const mock = simulerApi({
      '/admin/me': () =>
        connecteMaintenant ? { email: 'admin@campuslens.test', role: 'admin' } : { __status: 401 },
      '/admin/login': () => {
        connecteMaintenant = true;
        return { email: 'admin@campuslens.test', role: 'admin' };
      },
      '/admin/sources': SOURCES,
    });
    rendreApp('/admin/sources');
    await userEvent.type(await screen.findByLabelText('Adresse e-mail'), 'admin@campuslens.test');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'un-mot-de-passe');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(
      await screen.findByRole('table', { name: 'État des sources de données' }),
    ).toBeInTheDocument();
    expect(mock.mock.calls.some(([u]) => u === '/api/admin/login')).toBe(true);
  });

  it('« Voir le site » mène au site public (menu public), et on peut revenir à l’admin sans se reconnecter', async () => {
    connecte('admin', { '/aides': [] });
    rendreApp('/admin/sources');
    await userEvent.click(await screen.findByRole('link', { name: 'Voir le site' }));
    expect(
      await screen.findByRole('navigation', { name: 'Navigation principale' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Sections de l’administration' }),
    ).not.toBeInTheDocument();
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
    expect(await screen.findByText(/admin@campuslens.test \(admin\)/)).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Sections de l’administration' }),
    ).toBeInTheDocument();
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
    await userEvent.click(await screen.findByRole('link', { name: 'État des sources' }));
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
    await userEvent.click(await screen.findByRole('link', { name: 'État des sources' }));
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /Lancer/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Historique' }));
    await screen.findByRole('table', { name: 'Dernières modifications de données' });
    expect(screen.queryByRole('button', { name: /Annuler/ })).not.toBeInTheDocument();
  });

  it('historique : annuler une modification (admin) restaure la valeur', async () => {
    const mock = connecte('admin', { '/admin/historique/9/annuler': { restauree: '254' } });
    rendreApp('/admin');
    await userEvent.click(await screen.findByRole('link', { name: 'Historique' }));
    const tableau = await screen.findByRole('table', {
      name: 'Dernières modifications de données',
    });
    expect(within(tableau).getByText('254')).toBeInTheDocument();
    expect(within(tableau).getByText('Robot (passage 3)')).toBeInTheDocument();
    await userEvent.click(within(tableau).getByRole('button', { name: /Annuler/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('Valeur restaurée : 254.');
    expect(mock.mock.calls.some(([u]) => u === '/api/admin/historique/9/annuler')).toBe(true);
  });

  describe('messages non lus : pastille, titre de l’onglet, marquer comme lu', () => {
    it('la pastille affiche le nombre de messages non lus sur « Messages », sur toutes les pages de l’admin', async () => {
      connecte();
      rendreApp('/admin/sources'); // une autre page que Messages
      const lien = await screen.findByRole('link', { name: /^Messages/ });
      await vi.waitFor(() => expect(lien).toHaveTextContent('2'));
      expect(lien).toHaveAccessibleName('Messages 2 non lus');
      await vi.waitFor(() => expect(document.title).toBe('(2) Espace administration · CampusLens'));
    });

    it('au singulier, et rien du tout quand il n’y a aucun message non lu', async () => {
      connecte('admin', { '/admin/messages/non-lus': { nombre: 1 } });
      rendreApp('/admin');
      expect(await screen.findByRole('link', { name: 'Messages 1 non lu' })).toBeInTheDocument();
      cleanup();

      connecte('admin', { '/admin/messages/non-lus': { nombre: 0 } });
      rendreApp('/admin');
      const lien = await screen.findByRole('link', { name: 'Messages' });
      expect(lien.querySelector('.pastille-compteur')).toBeNull();
      await vi.waitFor(() => expect(document.title).toBe('Espace administration · CampusLens'));
    });

    it('au-delà de 99, la pastille affiche « 99+ »', async () => {
      connecte('admin', { '/admin/messages/non-lus': { nombre: 250 } });
      rendreApp('/admin');
      expect(await screen.findByRole('link', { name: 'Messages 99+ non lus' })).toBeInTheDocument();
    });

    it('le « relecteur » n’a ni la pastille ni aucun appel au compteur (données personnelles)', async () => {
      const mock = connecte('relecteur');
      rendreApp('/admin');
      await screen.findByRole('navigation', { name: 'Sections de l’administration' });
      expect(screen.queryByRole('link', { name: /^Messages/ })).not.toBeInTheDocument();
      expect(mock.mock.calls.some(([u]) => u.includes('/non-lus'))).toBe(false);
      expect(document.title).toBe('Espace administration · CampusLens');
    });

    it('une erreur passagère du compteur ne casse pas l’admin', async () => {
      connecte('admin', { '/admin/messages/non-lus': new Error('panne') });
      rendreApp('/admin');
      expect(
        await screen.findByRole('navigation', { name: 'Sections de l’administration' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('le compteur est relu à chaque changement de page et toutes les minutes', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        const mock = connecte();
        rendreApp('/admin/sources');
        await screen.findByRole('link', { name: /^Messages/ });
        const appels = () =>
          mock.mock.calls.filter(([u]) => u === '/api/admin/messages/non-lus').length;
        await vi.waitFor(() => expect(appels()).toBe(1));
        await userEvent.click(screen.getByRole('link', { name: 'Historique' }));
        await vi.waitFor(() => expect(appels()).toBe(2)); // changement de page
        await vi.advanceTimersByTimeAsync(60_000);
        await vi.waitFor(() => expect(appels()).toBeGreaterThanOrEqual(3)); // rappel automatique
      } finally {
        vi.useRealTimers();
      }
    });

    it('dans Messages : « Nouveau » sur les non lus seulement, résumé et bouton « Tout marquer comme lu »', async () => {
      connecte('admin', {
        '/admin/messages': [
          { ...MESSAGES[0], luLe: null },
          { ...MESSAGES[1], luLe: '2026-11-05T12:00:00Z' },
        ],
      });
      rendreApp('/admin/messages');
      const nouveau = (
        await screen.findByRole('heading', { name: /Question sur la bourse/ })
      ).closest('li');
      expect(within(nouveau).getByText('Nouveau')).toBeInTheDocument();
      expect(within(nouveau).getByRole('button', { name: /Marquer comme lu/ })).toBeInTheDocument();
      const lu = screen.getByRole('heading', { name: /Erreur sur une aide/ }).closest('li');
      expect(within(lu).queryByText('Nouveau')).not.toBeInTheDocument();
      expect(
        within(lu).queryByRole('button', { name: /Marquer comme lu/ }),
      ).not.toBeInTheDocument();
      expect(screen.getByText('1 message non lu')).toBeInTheDocument();
    });

    it('« Marquer comme lu » : POST, puis la liste et la pastille sont rafraîchies', async () => {
      let lu = false;
      const mock = connecte('admin', {
        '/admin/messages': () => [{ ...MESSAGES[0], luLe: lu ? '2026-11-05T12:00:00Z' : null }],
        '/admin/messages/non-lus': () => ({ nombre: lu ? 0 : 1 }),
        '/admin/messages/4/lu': () => {
          lu = true;
          return {};
        },
      });
      rendreApp('/admin/messages');
      await userEvent.click(await screen.findByRole('button', { name: /Marquer comme lu/ }));
      await vi.waitFor(() => expect(screen.queryByText('Nouveau')).not.toBeInTheDocument());
      expect(mock.mock.calls.find(([u]) => u === '/api/admin/messages/4/lu')[1].method).toBe(
        'POST',
      );
      await vi.waitFor(() =>
        expect(screen.getByRole('link', { name: 'Messages' })).toBeInTheDocument(),
      ); // plus de pastille
      expect(document.title).toBe('Espace administration · CampusLens');
    });

    it('« Tout marquer comme lu » : POST, confirmation, plus aucun « Nouveau »', async () => {
      let tout = false;
      const mock = connecte('admin', {
        '/admin/messages': () =>
          MESSAGES.map((m) => ({ ...m, luLe: tout ? '2026-11-05T12:00:00Z' : null })),
        '/admin/messages/non-lus': () => ({ nombre: tout ? 0 : 2 }),
        '/admin/messages/tout-lire': () => {
          tout = true;
          return { marques: 2 };
        },
      });
      rendreApp('/admin/messages');
      await userEvent.click(await screen.findByRole('button', { name: 'Tout marquer comme lu' }));
      expect(await screen.findByRole('status')).toHaveTextContent(
        'Tous les messages sont marqués comme lus.',
      );
      await vi.waitFor(() => expect(screen.queryByText('Nouveau')).not.toBeInTheDocument());
      expect(mock.mock.calls.find(([u]) => u === '/api/admin/messages/tout-lire')[1].method).toBe(
        'POST',
      );
      expect(
        screen.queryByRole('button', { name: 'Tout marquer comme lu' }),
      ).not.toBeInTheDocument();
    });
  });

  it('onglet Messages : liste les messages avec expéditeur, dates et lien pour répondre', async () => {
    connecte();
    rendreApp('/admin');
    await userEvent.click(await screen.findByRole('link', { name: /^Messages/ }));
    const carte = (await screen.findByRole('heading', { name: /^Question sur la bourse/ })).closest(
      'li',
    );
    expect(within(carte).getByRole('link', { name: 'etudiant@exemple.fr' })).toHaveAttribute(
      'href',
      'mailto:etudiant@exemple.fr',
    );
    expect(carte).toHaveTextContent('supprimé automatiquement le 5 mai 2027');
    expect(carte).toHaveTextContent('comment demander la bourse');
    const repondre = within(carte).getByRole('link', { name: /Répondre/ });
    expect(repondre).toHaveAttribute(
      'href',
      'mailto:etudiant@exemple.fr?subject=Re%3A%20Question%20sur%20la%20bourse',
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('un message contenant du code HTML est affiché comme du texte, jamais interprété', async () => {
    connecte();
    rendreApp('/admin');
    await userEvent.click(await screen.findByRole('link', { name: /^Messages/ }));
    const texte = await screen.findByText(/<script>alert\(1\)<\/script> Le lien est cassé\./);
    expect(texte.tagName).toBe('P');
    expect(document.querySelector('script[src], .message-texte script')).toBeNull();
  });

  it('supprimer un message : confirmation, DELETE, puis la liste est rechargée', async () => {
    let supprime = false;
    const mock = connecte('admin', {
      '/admin/messages': () => (supprime ? [MESSAGES[1]] : MESSAGES),
      '/admin/messages/4': () => {
        supprime = true;
        return {};
      },
    });
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(true);
    rendreApp('/admin');
    await userEvent.click(await screen.findByRole('link', { name: /^Messages/ }));
    await userEvent.click(
      await screen.findByRole('button', { name: /^Supprimer.*Question sur la bourse/ }),
    );
    expect(confirmation).toHaveBeenCalledWith(expect.stringContaining('etudiant@exemple.fr'));
    expect(await screen.findByRole('status')).toHaveTextContent('Message supprimé.');
    await vi.waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: /^Question sur la bourse/ }),
      ).not.toBeInTheDocument(),
    );
    expect(
      mock.mock.calls.find(([u, o]) => u === '/api/admin/messages/4' && o.method === 'DELETE'),
    ).toBeTruthy();
    confirmation.mockRestore();
  });

  it('suppression refusée dans la fenêtre de confirmation : rien n’est envoyé', async () => {
    const mock = connecte();
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(false);
    rendreApp('/admin');
    await userEvent.click(await screen.findByRole('link', { name: /^Messages/ }));
    await userEvent.click(
      await screen.findByRole('button', { name: /^Supprimer.*Question sur la bourse/ }),
    );
    expect(mock.mock.calls.some(([, o]) => o?.method === 'DELETE')).toBe(false);
    confirmation.mockRestore();
  });

  it('aucun message : le dit clairement ; erreur de suppression : message, pas de plantage', async () => {
    connecte('admin', { '/admin/messages': [] });
    rendreApp('/admin');
    await userEvent.click(await screen.findByRole('link', { name: /^Messages/ }));
    expect(await screen.findByText(/Aucun message reçu/)).toBeInTheDocument();
    cleanup();

    connecte('admin', {
      '/admin/messages/4': { __status: 404, corps: { error: 'Message introuvable.' } },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    rendreApp('/admin');
    await userEvent.click(await screen.findByRole('link', { name: /^Messages/ }));
    await userEvent.click(
      await screen.findByRole('button', { name: /^Supprimer.*Question sur la bourse/ }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Message introuvable.');
    window.confirm.mockRestore?.();
  });

  it('un relecteur qui ouvre /admin/messages à la main est ramené à « À valider »', async () => {
    connecte('relecteur');
    rendreApp('/admin/messages');
    expect(
      await screen.findByRole('heading', { name: /Droits d’inscription nationaux/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /^Question sur la bourse/ }),
    ).not.toBeInTheDocument();
  });

  it('le rôle « relecteur » ne voit pas l’onglet Messages (données personnelles)', async () => {
    connecte('relecteur');
    rendreApp('/admin');
    await screen.findByRole('link', { name: 'Historique' });
    expect(screen.queryByRole('link', { name: /^Messages/ })).not.toBeInTheDocument();
  });

  describe('Mon compte : changer son mot de passe', () => {
    const NOUVEAU = 'Une nouvelle phrase de passe solide';
    const ouvrirCompte = async (role = 'admin', extra = {}) => {
      const mock = connecte(role, {
        '/admin/mot-de-passe': { message: 'Mot de passe modifié.' },
        ...extra,
      });
      rendreApp('/admin/compte');
      await screen.findByRole('heading', { name: 'Changer mon mot de passe' });
      return mock;
    };
    const remplir = async (
      ancien = 'ancien-mot-de-passe',
      nouveau = NOUVEAU,
      confirmation = nouveau,
    ) => {
      await userEvent.type(screen.getByLabelText('Mot de passe actuel'), ancien);
      await userEvent.type(screen.getByLabelText('Nouveau mot de passe'), nouveau);
      if (confirmation)
        await userEvent.type(
          screen.getByLabelText('Confirmer le nouveau mot de passe'),
          confirmation,
        );
    };

    it('le lien « Mon compte » existe pour tous les rôles, et mène à /admin/compte', async () => {
      for (const role of ['admin', 'relecteur']) {
        connecte(role);
        rendreApp('/admin');
        const lien = await screen.findByRole('link', { name: 'Mon compte' });
        expect(lien).toHaveAttribute('href', '/admin/compte');
        cleanup();
      }
    });

    it('affiche le compte, des champs adaptés aux gestionnaires de mots de passe, masqués par défaut', async () => {
      await ouvrirCompte();
      expect(screen.getByText(/Compte :/)).toHaveTextContent('admin@campuslens.test');
      expect(screen.getByLabelText('Mot de passe actuel')).toHaveAttribute('type', 'password');
      expect(screen.getByLabelText('Mot de passe actuel')).toHaveAttribute(
        'autocomplete',
        'current-password',
      );
      expect(screen.getByLabelText('Nouveau mot de passe')).toHaveAttribute(
        'autocomplete',
        'new-password',
      );
      expect(screen.getByLabelText('Confirmer le nouveau mot de passe')).toHaveAttribute(
        'type',
        'password',
      );
      expect(screen.getByRole('button', { name: 'Changer mon mot de passe' })).toBeDisabled();
    });

    it('« Afficher les mots de passe » révèle les champs', async () => {
      await ouvrirCompte();
      await userEvent.click(screen.getByLabelText('Afficher les mots de passe'));
      for (const champ of [
        'Mot de passe actuel',
        'Nouveau mot de passe',
        'Confirmer le nouveau mot de passe',
      ]) {
        expect(screen.getByLabelText(champ)).toHaveAttribute('type', 'text');
      }
    });

    it('le bouton reste inactif tant que le nouveau mot de passe est trop court ou mal confirmé, avec un message clair', async () => {
      await ouvrirCompte();
      await remplir('ancien', 'court', 'court');
      expect(screen.getByRole('button', { name: 'Changer mon mot de passe' })).toBeDisabled();
      expect(screen.getByLabelText('Nouveau mot de passe')).toHaveAttribute('aria-invalid', 'true');
      cleanup();

      await ouvrirCompte();
      await remplir('ancien', NOUVEAU, 'autre phrase de passe');
      expect(screen.getByRole('button', { name: 'Changer mon mot de passe' })).toBeDisabled();
      expect(
        screen.getByText('Les deux mots de passe ne sont pas identiques.'),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Confirmer le nouveau mot de passe')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    });

    it('envoie ancien et nouveau (jamais la confirmation), confirme, et vide les champs', async () => {
      const mock = await ouvrirCompte();
      await remplir();
      const bouton = screen.getByRole('button', { name: 'Changer mon mot de passe' });
      expect(bouton).toBeEnabled();
      await userEvent.click(bouton);
      expect(await screen.findByRole('status')).toHaveTextContent(
        'Mot de passe modifié. Vos autres appareils connectés ont été déconnectés',
      );
      const appel = mock.mock.calls.find(([u]) => u === '/api/admin/mot-de-passe');
      expect(appel[1].method).toBe('POST');
      expect(JSON.parse(appel[1].body)).toEqual({
        ancien: 'ancien-mot-de-passe',
        nouveau: NOUVEAU,
      });
      expect(screen.getByLabelText('Mot de passe actuel')).toHaveValue('');
      expect(screen.getByLabelText('Nouveau mot de passe')).toHaveValue('');
      expect(screen.getByLabelText('Confirmer le nouveau mot de passe')).toHaveValue('');
    });

    it('mauvais mot de passe actuel → message clair, les champs sont conservés', async () => {
      await ouvrirCompte('admin', {
        '/admin/mot-de-passe': {
          __status: 401,
          corps: { error: 'Le mot de passe actuel est incorrect.' },
        },
      });
      await remplir();
      await userEvent.click(screen.getByRole('button', { name: 'Changer mon mot de passe' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Le mot de passe actuel est incorrect.',
      );
      expect(screen.getByLabelText('Nouveau mot de passe')).toHaveValue(NOUVEAU);
    });

    it('règle refusée par le serveur (400) et blocage temporaire (429) → messages clairs', async () => {
      await ouvrirCompte('admin', {
        '/admin/mot-de-passe': {
          __status: 400,
          corps: { error: 'Le mot de passe ne doit pas contenir votre adresse e-mail.' },
        },
      });
      await remplir();
      await userEvent.click(screen.getByRole('button', { name: 'Changer mon mot de passe' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('adresse e-mail');
      cleanup();

      await ouvrirCompte('admin', { '/admin/mot-de-passe': { __status: 429, corps: {} } });
      await remplir();
      await userEvent.click(screen.getByRole('button', { name: 'Changer mon mot de passe' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Trop de tentatives');
    });

    it('accessibilité : aucune violation axe-core', async () => {
      await ouvrirCompte();
      await remplir('ancien', 'court', 'autre');
      expect(await violationsAxe(document.body)).toEqual([]);
    });
  });

  it('déconnexion : retour au formulaire de connexion', async () => {
    connecte();
    rendreApp('/admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Se déconnecter' }));
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
  });

  it('déconnexion : même si le serveur ne répond pas, on revient à la connexion (sans erreur non gérée)', async () => {
    connecte('admin', { '/admin/logout': new Error('réseau coupé') });
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
    await userEvent.click(screen.getByRole('link', { name: 'État des sources' }));
    await screen.findByRole('table');
    expect(await violationsAxe(b.container)).toEqual([]);
    await userEvent.click(screen.getByRole('link', { name: 'Historique' }));
    await screen.findByRole('table', { name: 'Dernières modifications de données' });
    expect(await violationsAxe(b.container)).toEqual([]);
    await userEvent.click(screen.getByRole('link', { name: /^Messages/ }));
    await screen.findByRole('heading', { name: /^Question sur la bourse/ });
    expect(await violationsAxe(b.container)).toEqual([]);
  });
});
