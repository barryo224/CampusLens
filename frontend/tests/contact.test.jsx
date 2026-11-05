import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rendreApp, violationsAxe } from './helpers/rendu.jsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function remplir() {
  await userEvent.type(screen.getByLabelText('Objet'), 'Une question');
  await userEvent.type(screen.getByLabelText('Votre adresse e-mail'), 'etudiant@exemple.fr');
  await userEvent.type(screen.getByLabelText('Message'), 'Bonjour, comment faire ?');
}

describe('Contact', () => {
  it('envoie le message en POST et confirme', async () => {
    const mock = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ message: 'ok' }),
    }));
    vi.stubGlobal('fetch', mock);
    rendreApp('/contact');
    await remplir();
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Message envoyé');
    const [url, options] = mock.mock.calls[0];
    expect(url).toBe('/api/contact');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({
      objet: 'Une question',
      email: 'etudiant@exemple.fr',
      message: 'Bonjour, comment faire ?',
      siteWeb: '', // le champ piège reste vide pour un humain
    });
    expect(screen.getByLabelText('Objet')).toHaveValue(''); // formulaire vidé
  });

  it('trop de messages (429) → message clair, rien n’est perdu', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) })),
    );
    rendreApp('/contact');
    await remplir();
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Trop de messages/);
    expect(screen.getByLabelText('Message')).toHaveValue('Bonjour, comment faire ?');
  });

  it('serveur injoignable → message clair', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('x');
      }),
    );
    rendreApp('/contact');
    await remplir();
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/momentanément indisponibles/);
  });

  it('le champ piège est caché aux lecteurs d’écran et hors du parcours clavier', () => {
    rendreApp('/contact');
    const piege = screen.getByLabelText('Ne pas remplir', { selector: 'input' });
    expect(piege).toHaveAttribute('tabindex', '-1');
    expect(piege.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('propose aussi l’adresse e-mail directe de l’équipe', () => {
    rendreApp('/contact');
    const lien = screen.getByRole('link', { name: 'ousmanebarrie224@gmail.com' });
    expect(lien).toHaveAttribute('href', 'mailto:ousmanebarrie224@gmail.com');
  });

  it('accessibilité : aucune violation axe-core', async () => {
    const { container } = rendreApp('/contact');
    expect(await violationsAxe(container)).toEqual([]);
  });
});

describe('Mentions légales', () => {
  it('expose la confidentialité : simulateur anonyme, 6 mois, droits RGPD', async () => {
    const { container } = rendreApp('/mentions-legales');
    expect(
      screen.getByRole('heading', { level: 1, name: /Mentions légales et confidentialité/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Le simulateur ne transmet rien/)).toBeInTheDocument();
    expect(screen.getByText(/6 mois/)).toBeInTheDocument();
    expect(screen.getByText(/CNIL/)).toBeInTheDocument();
    expect(screen.getByText(/Responsable de la publication : Ousmane Barry/)).toBeInTheDocument();
    expect(screen.queryByText(/nom et prénom à compléter/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ousmanebarrie224@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:ousmanebarrie224@gmail.com',
    );
    expect(await violationsAxe(container)).toEqual([]);
  });
});
