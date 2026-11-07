import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, cleanup, within, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rendreApp, simulerApi } from './helpers/rendu.jsx';
import { EVENEMENT_SESSION_EXPIREE } from '../src/lib/api.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const COMPTE = { email: 'admin@campuslens.test', role: 'admin', deuxFacteurs: true };
const SESSION_TERMINEE = {
  __status: 401,
  corps: { error: 'Authentification requise.', code: 'session_expiree' },
};
const NOUVEAU = 'Une nouvelle phrase de passe solide';

/** Administration ouverte sur « Mon compte », avec des réponses supplémentaires au besoin. */
async function ouvrirCompte(extra = {}) {
  const mock = simulerApi({
    '/admin/me': COMPTE,
    '/admin/2fa': { actif: true },
    '/admin/messages/non-lus': { nombre: 0, avis: 0 },
    '/admin/mot-de-passe': { message: 'Mot de passe modifié.' },
    ...extra,
  });
  rendreApp('/admin/compte');
  await screen.findByRole('heading', { name: 'Changer mon mot de passe' });
  return mock;
}
const saisir = async () => {
  await userEvent.type(screen.getByLabelText('Mot de passe actuel'), 'ancien-mot-de-passe');
  await userEvent.type(screen.getByLabelText('Nouveau mot de passe'), NOUVEAU);
  await userEvent.type(screen.getByLabelText('Confirmer le nouveau mot de passe'), NOUVEAU);
};

describe('Session d’administration expirée', () => {
  it('une action refusée pour session terminée ouvre la reconnexion PAR-DESSUS la page : la saisie est conservée', async () => {
    await ouvrirCompte({ '/admin/mot-de-passe': SESSION_TERMINEE });
    await saisir();
    await userEvent.click(screen.getByRole('button', { name: 'Changer mon mot de passe' }));

    const fenetre = await screen.findByRole('dialog', { name: 'Reconnexion' });
    expect(within(fenetre).getByRole('heading', { name: 'Session expirée' })).toBeInTheDocument();
    expect(fenetre).toHaveTextContent('Session expirée. Reconnectez-vous pour continuer.');
    expect(fenetre).not.toHaveTextContent('conservé');
    // Adresse déjà remplie : on ne tape que le mot de passe.
    expect(within(fenetre).getByLabelText('Adresse e-mail')).toHaveValue(COMPTE.email);
    expect(within(fenetre).getByLabelText('Mot de passe')).toHaveFocus();
    // La page dessous reste affichée avec ce qui avait été saisi, mais n'est plus utilisable (inerte).
    expect(document.querySelector('main')).toHaveAttribute('inert');
    expect(document.querySelector('header.admin-barre')).toHaveAttribute('inert');
    expect(document.querySelector('#mdp-nouveau')).toHaveValue(NOUVEAU);

    // Reconnexion : la fenêtre disparaît, la saisie est toujours là, on reste sur la même page.
    simulerApi({
      '/admin/me': COMPTE,
      '/admin/2fa': { actif: true },
      '/admin/messages/non-lus': { nombre: 0, avis: 0 },
      '/admin/login': COMPTE,
    });
    await userEvent.type(within(fenetre).getByLabelText('Mot de passe'), 'le-bon-mot-de-passe');
    await userEvent.click(within(fenetre).getByRole('button', { name: 'Se connecter' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.querySelector('main')).not.toHaveAttribute('inert');
    expect(document.querySelector('#mdp-nouveau')).toHaveValue(NOUVEAU);
    expect(screen.getByRole('heading', { name: 'Changer mon mot de passe' })).toBeInTheDocument();
  });

  it('un simple mauvais mot de passe (401 sans code de session) n’ouvre PAS la fenêtre de reconnexion', async () => {
    await ouvrirCompte({
      '/admin/mot-de-passe': {
        __status: 401,
        corps: { error: 'Le mot de passe actuel est incorrect.' },
      },
    });
    await saisir();
    await userEvent.click(screen.getByRole('button', { name: 'Changer mon mot de passe' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('mot de passe actuel est incorrect');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('une page qui n’a pas pu se charger (session finie) : déconnexion avec un avertissement jaune ; la reconnexion repart de l’accueil de l’administration', async () => {
    simulerApi({
      '/admin/me': COMPTE,
      '/admin/messages/non-lus': { nombre: 0, avis: 0 },
      '/admin/messages': SESSION_TERMINEE,
      '/admin/login': COMPTE,
      '/admin/changements': [],
    });
    rendreApp('/admin/messages');
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
    const avertissement = screen.getByRole('status');
    expect(avertissement).toHaveTextContent('Session expirée. Veuillez vous reconnecter.');
    expect(avertissement).toHaveClass('message-avertissement');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(avertissement).not.toHaveTextContent(/10 minutes|inactivité/);

    await userEvent.type(screen.getByLabelText('Mot de passe'), 'le-bon-mot-de-passe');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    // On arrive sur l'accueil de l'administration (« Changements à valider »), pas sur la page « Messages » d'avant.
    expect(await screen.findByText(/Aucun changement à valider/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^Messages/ })).not.toBeInTheDocument();
  });

  it('le contrôle régulier de la session ouvre la reconnexion même si l’on ne touche à rien', async () => {
    let session = true;
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    simulerApi({
      '/admin/me': () => (session ? COMPTE : SESSION_TERMINEE),
      '/admin/2fa': { actif: true },
      '/admin/messages/non-lus': () => (session ? { nombre: 0, avis: 0 } : SESSION_TERMINEE),
    });
    rendreApp('/admin/compte');
    await screen.findByRole('heading', { name: 'Changer mon mot de passe' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    session = false; // le serveur ferme la session (12 h écoulées, par exemple)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(
      await screen.findByRole('heading', { name: 'Connexion' }, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Session expirée. Veuillez vous reconnecter.',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('au retour sur l’onglet, la session est contrôlée tout de suite', async () => {
    let session = true;
    simulerApi({
      '/admin/me': () => (session ? COMPTE : SESSION_TERMINEE),
      '/admin/2fa': { actif: true },
      '/admin/messages/non-lus': { nombre: 0, avis: 0 },
    });
    rendreApp('/admin/compte');
    await screen.findByRole('heading', { name: 'Changer mon mot de passe' });
    session = false;
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(
      await screen.findByRole('dialog', { name: 'Reconnexion' }, { timeout: 4000 }),
    ).toBeInTheDocument();
  });

  it('l’événement de session expirée n’a aucun effet quand personne n’est connecté', async () => {
    simulerApi({ '/admin/me': { __status: 401, corps: { error: 'Authentification requise.' } } });
    rendreApp('/admin');
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(
        new CustomEvent(EVENEMENT_SESSION_EXPIREE, { detail: { lecture: true } }),
      );
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
  });
});

describe('Déconnexion volontaire', () => {
  it('on se déconnecte depuis une page précise, puis on se reconnecte : on arrive à l’accueil de l’administration, pas sur la même page', async () => {
    simulerApi({
      '/admin/me': COMPTE,
      '/admin/2fa': { actif: true },
      '/admin/messages/non-lus': { nombre: 0, avis: 0 },
      '/admin/historique': [],
      '/admin/changements': [],
      '/admin/logout': {},
      '/admin/login': COMPTE,
    });
    rendreApp('/admin/historique');
    await screen.findByRole('button', { name: 'Se déconnecter' });
    await userEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }));
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull(); // déconnexion voulue : aucun avertissement

    await userEvent.type(screen.getByLabelText('Adresse e-mail'), COMPTE.email);
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'le-bon-mot-de-passe');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByText(/Aucun changement à valider/)).toBeInTheDocument();
  });
});

describe('Contrôles d’arrière-plan', () => {
  it('le contrôle de la session et le compteur de non lus se signalent au serveur (ils ne comptent pas comme une action)', async () => {
    const mock = simulerApi({
      '/admin/me': COMPTE,
      '/admin/2fa': { actif: true },
      '/admin/messages/non-lus': { nombre: 0, avis: 0 },
    });
    rendreApp('/admin/compte');
    await screen.findByRole('heading', { name: 'Changer mon mot de passe' });
    const appels = mock.mock.calls.filter(([u]) => u.includes('/admin/messages/non-lus'));
    expect(appels.length).toBeGreaterThan(0);
    for (const [, options] of appels) expect(options.headers['X-Controle']).toBe('1');
    // La lecture de la page elle-même (contrôle initial du compte, double authentification) est une vraie action.
    const initial = mock.mock.calls.find(([u]) => u === '/api/admin/me');
    expect(initial[1].headers['X-Controle']).toBeUndefined();
  });
});

describe('Le serveur et la page comptent l’inactivité de la même façon', () => {
  it('un geste dans la dernière minute : le contrôle automatique compte comme une action ; sans geste, non', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const mock = simulerApi({
      '/admin/me': COMPTE,
      '/admin/2fa': { actif: true },
      '/admin/messages/non-lus': { nombre: 0, avis: 0 },
    });
    rendreApp('/admin/compte');
    await screen.findByRole('heading', { name: 'Changer mon mot de passe' });
    const controles = () =>
      mock.mock.calls
        .filter(([u]) => u === '/api/admin/me')
        .map(([, o]) => o.headers['X-Controle']);
    const avant = controles().length;

    // Un geste (défilement), puis le contrôle de la minute : il compte comme une action (pas d'en-tête X-Controle).
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(controles().slice(avant)).toEqual([undefined]);

    // Plus aucun geste : la minute suivante, le contrôle ne compte plus comme une action.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(controles().slice(avant)).toEqual([undefined, '1']);
  });
});

describe('Déconnexion automatique après inactivité', () => {
  const lancer = async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const mock = simulerApi({
      '/admin/me': COMPTE,
      '/admin/2fa': { actif: true },
      '/admin/messages/non-lus': { nombre: 0, avis: 0 },
      '/admin/logout': {},
    });
    rendreApp('/admin/compte');
    await screen.findByRole('heading', { name: 'Changer mon mot de passe' });
    return mock;
  };
  const avancer = (minutes) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(minutes * 60_000);
    });

  it('10 minutes sans aucun geste : déconnexion, avertissement « Session expirée » (sans explication sur les 10 minutes)', async () => {
    const mock = await lancer();
    await avancer(11);
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
    const avertissement = screen.getByRole('status');
    expect(avertissement).toHaveTextContent('Session expirée. Veuillez vous reconnecter.');
    expect(avertissement).toHaveClass('message-avertissement');
    expect(avertissement).not.toHaveTextContent(/10 minutes|inactivité/);
    expect(mock.mock.calls.some(([u]) => u === '/api/admin/logout')).toBe(true); // la session est aussi fermée côté serveur
    expect(screen.queryByRole('navigation', { name: 'Sections de l’administration' })).toBeNull();
  });

  it('un geste (touche, clic, toucher, défilement) repousse la déconnexion', async () => {
    await lancer();
    await avancer(6);
    act(() => {
      window.dispatchEvent(new Event('keydown'));
    });
    await avancer(6); // 12 minutes en tout, mais seulement 6 depuis le dernier geste
    expect(screen.queryByRole('heading', { name: 'Connexion' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Changer mon mot de passe' })).toBeInTheDocument();
    await avancer(5); // 11 minutes sans geste
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
  });
});
