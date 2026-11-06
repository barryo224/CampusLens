import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, cleanup, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rendreApp, simulerApi } from './helpers/rendu.jsx';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const COMPTE = { email: 'ousmane@exemple.fr', role: 'admin', deuxFacteurs: false };
const ETAPE_COURRIEL = {
  etape: 'code',
  methode: 'courriel',
  adresse: 'o*****e@exemple.fr',
  application: false,
  renvoyerApres: 30,
};

async function ouvrirEtapeCode(login, extra = {}) {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  const mock = simulerApi({
    '/admin/me': { __status: 401, corps: { error: 'Authentification requise.' } },
    '/admin/login': login,
    ...extra,
  });
  rendreApp('/admin');
  await userEvent.type(await screen.findByLabelText('Adresse e-mail'), COMPTE.email, {
    advanceTimers: vi.advanceTimersByTime,
  });
  await userEvent.type(screen.getByLabelText('Mot de passe'), 'un-mot-de-passe-solide', {
    advanceTimers: vi.advanceTimersByTime,
  });
  await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
  return mock;
}
const avancer = (s) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(s * 1000);
  });

describe('Connexion : code reçu par e-mail', () => {
  it('explique où le code a été envoyé et propose le code au clavier (6 chiffres, « one-time-code »)', async () => {
    await ouvrirEtapeCode(ETAPE_COURRIEL);
    expect(
      await screen.findByRole('heading', { name: 'Vérification par e-mail' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/o\*{5}e@exemple\.fr/)).toBeInTheDocument();
    expect(screen.getByText(/valable 5 minutes/)).toBeInTheDocument();
    const champ = screen.getByLabelText('Code reçu par e-mail');
    expect(champ).toHaveAttribute('autocomplete', 'one-time-code');
    expect(champ).toHaveAttribute('inputmode', 'numeric');
    expect(champ).toHaveFocus();
  });

  it('« Renvoyer le code » : décompte de 30 s, puis bouton actif ; un clic renvoie un code et relance le décompte', async () => {
    const mock = await ouvrirEtapeCode(ETAPE_COURRIEL, {
      '/admin/login/renvoyer': { renvoyerApres: 30 },
    });
    const bouton = await screen.findByRole('button', { name: /Renvoyer le code/ });
    expect(bouton).toBeDisabled();
    expect(bouton).toHaveTextContent('Renvoyer le code dans 30 s');
    await avancer(1);
    expect(screen.getByRole('button', { name: /Renvoyer le code/ })).toHaveTextContent('dans 29 s');
    await avancer(29);
    const pret = screen.getByRole('button', { name: 'Renvoyer le code' });
    expect(pret).toBeEnabled();

    await userEvent.click(pret, { advanceTimers: vi.advanceTimersByTime });
    await waitFor(() =>
      expect(mock.mock.calls.some(([u]) => u === '/api/admin/login/renvoyer')).toBe(true),
    );
    expect(await screen.findByText(/Un nouveau code vient d’être envoyé/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Renvoyer le code/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Renvoyer le code/ })).toHaveTextContent('dans 30 s');
  });

  it('code tapé à la main : rien ne part tant que vous ne cliquez pas sur « Valider »', async () => {
    let ouvert = false;
    const mock = await ouvrirEtapeCode(ETAPE_COURRIEL, {
      '/admin/me': () => (ouvert ? COMPTE : { __status: 401 }),
      '/admin/login/code': () => {
        ouvert = true;
        return COMPTE;
      },
      '/admin/changements': [],
    });
    const champ = await screen.findByLabelText('Code reçu par e-mail');
    await userEvent.type(champ, '123456', { advanceTimers: vi.advanceTimersByTime });
    expect(champ).toHaveValue('123456');
    expect(mock.mock.calls.some(([u]) => u === '/api/admin/login/code')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }), {
      advanceTimers: vi.advanceTimersByTime,
    });
    await waitFor(() =>
      expect(mock.mock.calls.some(([u]) => u === '/api/admin/login/code')).toBe(true),
    );
    const appel = mock.mock.calls.find(([u]) => u === '/api/admin/login/code');
    expect(JSON.parse(appel[1].body)).toEqual({ code: '123456' });
  });

  it('code proposé par le clavier (ou collé) : il arrive d’un coup et se valide tout seul', async () => {
    let ouvert = false;
    const mock = await ouvrirEtapeCode(ETAPE_COURRIEL, {
      '/admin/me': () => (ouvert ? COMPTE : { __status: 401 }),
      '/admin/login/code': () => {
        ouvert = true;
        return COMPTE;
      },
      '/admin/changements': [],
    });
    const champ = await screen.findByLabelText('Code reçu par e-mail');
    await userEvent.click(champ, { advanceTimers: vi.advanceTimersByTime });
    await userEvent.paste('654321');
    await waitFor(() =>
      expect(mock.mock.calls.some(([u]) => u === '/api/admin/login/code')).toBe(true),
    );
    const appel = mock.mock.calls.find(([u]) => u === '/api/admin/login/code');
    expect(JSON.parse(appel[1].body)).toEqual({ code: '654321' });
  });

  it('il n’y a pas de bouton « Retour » : seul le « Retour » du navigateur ramène en arrière', async () => {
    await ouvrirEtapeCode(ETAPE_COURRIEL);
    await screen.findByLabelText('Code reçu par e-mail');
    expect(screen.queryByRole('button', { name: 'Retour' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Valider' })).toBeInTheDocument();
  });

  it('un code faux est signalé et le champ se vide', async () => {
    await ouvrirEtapeCode(ETAPE_COURRIEL, {
      '/admin/login/code': { __status: 401, corps: { error: 'Code incorrect.' } },
    });
    const champ = await screen.findByLabelText('Code reçu par e-mail');
    await userEvent.type(champ, '000000', { advanceTimers: vi.advanceTimersByTime });
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }), {
      advanceTimers: vi.advanceTimersByTime,
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Code incorrect.');
    expect(champ).toHaveValue('');
  });

  it('avec l’application d’authentification activée : on peut basculer vers elle, et revenir à l’e-mail', async () => {
    await ouvrirEtapeCode({ ...ETAPE_COURRIEL, application: true });
    await userEvent.click(
      await screen.findByRole('button', { name: /Utiliser mon application d’authentification/ }),
      { advanceTimers: vi.advanceTimersByTime },
    );
    expect(screen.getByRole('heading', { name: 'Double authentification' })).toBeInTheDocument();
    expect(screen.getByLabelText('Code de sécurité')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Renvoyer le code/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Recevoir un code par e-mail/ }), {
      advanceTimers: vi.advanceTimersByTime,
    });
    expect(screen.getByLabelText('Code reçu par e-mail')).toBeInTheDocument();
  });

  it('sans application activée, aucune bascule n’est proposée', async () => {
    await ouvrirEtapeCode(ETAPE_COURRIEL);
    await screen.findByLabelText('Code reçu par e-mail');
    expect(
      screen.queryByRole('button', { name: /application d’authentification/ }),
    ).not.toBeInTheDocument();
  });

  it('e-mail impossible à envoyer : le site l’explique et passe directement sur l’application', async () => {
    await ouvrirEtapeCode({
      etape: 'code',
      methode: 'application',
      application: true,
      courrielEchec: true,
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /L’envoi du code par e-mail n’a pas fonctionné/,
    );
    expect(screen.getByLabelText('Code de sécurité')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Renvoyer le code/ })).not.toBeInTheDocument();
  });
});
