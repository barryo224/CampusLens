import { useEffect } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate, useLocation } from 'react-router-dom';
import App from '../src/App.jsx';
import { simulerApi } from './helpers/rendu.jsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Pilote le « Retour » et « Avancer » du navigateur (historique en mémoire) depuis le test.
const flèches = { retour: () => {}, avancer: () => {}, hash: '' };
function Pilote() {
  const navigate = useNavigate();
  const { hash } = useLocation();
  useEffect(() => {
    flèches.retour = () => navigate(-1);
    flèches.avancer = () => navigate(1);
    flèches.hash = hash;
  });
  return null;
}

async function arriverALEtapeCode() {
  const mock = simulerApi({
    '/admin/me': { __status: 401, corps: { error: 'Authentification requise.' } },
    '/admin/login': {
      etape: 'code',
      methode: 'courriel',
      adresse: 'o*****e@exemple.fr',
      application: false,
      renvoyerApres: 30,
    },
    '/admin/login/annuler': {},
  });
  render(
    <MemoryRouter initialEntries={['/admin']}>
      <Pilote />
      <App />
    </MemoryRouter>,
  );
  await userEvent.type(await screen.findByLabelText('Adresse e-mail'), 'ousmane@exemple.fr');
  await userEvent.type(screen.getByLabelText('Mot de passe'), 'un-mot-de-passe-solide');
  await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
  await screen.findByLabelText('Code reçu par e-mail');
  return mock;
}

describe('Connexion : flèches du navigateur à l’étape du code', () => {
  it('« Retour » : la tentative est abandonnée, adresse et mot de passe sont VIDES, et le serveur est prévenu', async () => {
    const mock = await arriverALEtapeCode();
    await waitFor(() => expect(flèches.hash).toBe('#verification'));
    act(() => flèches.retour());
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
    expect(screen.getByLabelText('Adresse e-mail')).toHaveValue('');
    expect(screen.getByLabelText('Mot de passe')).toHaveValue('');
    expect(screen.queryByLabelText('Code reçu par e-mail')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mock.mock.calls.some(([u]) => u === '/api/admin/login/annuler')).toBe(true),
    );
  });

  it('« Avancer » après un retour ne rouvre PAS l’étape du code : il faut reprendre au mot de passe', async () => {
    await arriverALEtapeCode();
    act(() => flèches.retour());
    await screen.findByRole('heading', { name: 'Connexion' });
    act(() => flèches.avancer());
    // L'entrée « #verification » est refermée toute seule : on reste sur un formulaire vierge.
    await waitFor(() => expect(flèches.hash).toBe(''));
    expect(screen.getByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Code reçu par e-mail')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Adresse e-mail')).toHaveValue('');
    expect(screen.getByLabelText('Mot de passe')).toHaveValue('');
  });
});
