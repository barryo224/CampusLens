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
    expect(fenetre).toHaveTextContent('ce que vous étiez en train de saisir est conservé');
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

  it('une page qui n’a pas pu se charger est rechargée après la reconnexion', async () => {
    let messagesDemandes = 0;
    simulerApi({
      '/admin/me': COMPTE,
      '/admin/messages/non-lus': { nombre: 0, avis: 0 },
      '/admin/messages': () => {
        messagesDemandes += 1;
        return messagesDemandes === 1
          ? SESSION_TERMINEE
          : [
              {
                id: 1,
                objet: 'Question sur la bourse',
                email: 'a@exemple.fr',
                message: 'Bonjour',
                creeLe: '2026-11-05T09:30:00Z',
                supprimerApres: '2027-05-05T09:30:00Z',
                luLe: null,
              },
            ];
      },
      '/admin/login': COMPTE,
    });
    rendreApp('/admin/messages');
    const fenetre = await screen.findByRole('dialog', { name: 'Reconnexion' });
    await userEvent.type(within(fenetre).getByLabelText('Mot de passe'), 'le-bon-mot-de-passe');
    await userEvent.click(within(fenetre).getByRole('button', { name: 'Se connecter' }));
    expect(
      await screen.findByRole('heading', { name: /^Question sur la bourse/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
      await screen.findByRole('dialog', { name: 'Reconnexion' }, { timeout: 4000 }),
    ).toBeInTheDocument();
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

  it('20 minutes sans aucun geste : déconnexion, message clair, et la page demandée reste la même', async () => {
    const mock = await lancer();
    await avancer(21);
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'déconnecté après 20 minutes d’inactivité',
    );
    expect(mock.mock.calls.some(([u]) => u === '/api/admin/logout')).toBe(true); // la session est aussi fermée côté serveur
    expect(screen.queryByRole('navigation', { name: 'Sections de l’administration' })).toBeNull();
  });

  it('un geste (touche, clic, toucher, défilement) repousse la déconnexion', async () => {
    await lancer();
    await avancer(12);
    act(() => {
      window.dispatchEvent(new Event('keydown'));
    });
    await avancer(12); // 24 minutes en tout, mais seulement 12 depuis le dernier geste
    expect(screen.queryByRole('heading', { name: 'Connexion' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Changer mon mot de passe' })).toBeInTheDocument();
    await avancer(9); // 21 minutes sans geste
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
  });
});
