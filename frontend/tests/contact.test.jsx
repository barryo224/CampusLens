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

  it('objet ou message rempli d’espaces : refusé avec un message clair, le curseur va sur le champ, rien n’est envoyé', async () => {
    const mock = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({}) }));
    vi.stubGlobal('fetch', mock);
    rendreApp('/contact');
    await userEvent.type(screen.getByLabelText('Votre adresse e-mail'), 'etudiant@exemple.fr');
    await userEvent.type(screen.getByLabelText('Objet'), '   ');
    await userEvent.type(screen.getByLabelText('Message'), 'Bonjour');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Renseignez l’objet avant d’envoyer.',
    );
    expect(document.activeElement).toBe(screen.getByLabelText('Objet'));

    await userEvent.clear(screen.getByLabelText('Objet'));
    await userEvent.type(screen.getByLabelText('Objet'), 'Question');
    await userEvent.clear(screen.getByLabelText('Message'));
    await userEvent.type(screen.getByLabelText('Message'), '    ');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Renseignez le message avant d’envoyer.',
    );
    expect(document.activeElement).toBe(screen.getByLabelText('Message'));
    expect(mock).not.toHaveBeenCalled();
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

  it('n’affiche aucune adresse e-mail personnelle : on écrit par le formulaire', () => {
    const { container } = rendreApp('/contact');
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(container.textContent).not.toMatch(/@gmail|@hotmail|@yahoo|@outlook/i);
    expect(screen.queryByText(/Vous préférez écrire directement/)).not.toBeInTheDocument();
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
    // Le contact passe par la page Contact : aucune adresse e-mail personnelle n'est publiée.
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(container.textContent).not.toMatch(/@gmail|@hotmail|@yahoo|@outlook/i);
    expect(screen.getByRole('link', { name: 'page Contact' })).toHaveAttribute('href', '/contact');
    expect(await violationsAxe(container)).toEqual([]);
  });
});
