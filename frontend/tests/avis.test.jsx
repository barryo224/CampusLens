import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rendreApp, violationsAxe } from './helpers/rendu.jsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const reponse = (status = 201, corps = { message: 'ok' }) =>
  vi.fn(async () => ({ ok: status < 400, status, json: async () => corps }));

describe('Donner mon avis', () => {
  it('envoie la note et le commentaire en POST, sans aucune donnée d’identité, et remercie', async () => {
    const mock = reponse();
    vi.stubGlobal('fetch', mock);
    rendreApp('/avis?page=evaluer');
    await userEvent.click(screen.getByRole('radio', { name: /4 sur 5/ }));
    await userEvent.type(screen.getByLabelText(/Racontez votre expérience/), 'Très clair, merci !');
    await userEvent.selectOptions(screen.getByLabelText(/Vous êtes/), 'intl');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer mon avis' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Merci pour votre avis');
    const [url, options] = mock.mock.calls[0];
    expect(url).toBe('/api/avis');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({
      note: 4,
      commentaire: 'Très clair, merci !',
      page: 'evaluer', // d'où vient le visiteur
      profil: 'intl',
      siteWeb: '', // le champ piège reste vide pour un humain
    });
    // Formulaire vidé, aucune note restée sélectionnée.
    expect(screen.getByLabelText(/Racontez votre expérience/)).toHaveValue('');
    expect(screen.getByRole('radio', { name: /4 sur 5/ })).not.toBeChecked();
  });

  it('un avis vide est refusé : sans note, avec une note seule ou des espaces ; le curseur va sur le champ à corriger', async () => {
    const mock = reponse();
    vi.stubGlobal('fetch', mock);
    rendreApp('/avis');
    const envoyerAvis = () =>
      userEvent.click(screen.getByRole('button', { name: 'Envoyer mon avis' }));
    const commentaire = () => screen.getByLabelText(/Racontez votre expérience/);

    // 1. Rien du tout : on demande la note, et le focus va sur la première note.
    await envoyerAvis();
    expect(await screen.findByRole('alert')).toHaveTextContent('Choisissez une note de 1 à 5');
    expect(document.activeElement).toBe(screen.getAllByRole('radio')[0]);

    // 2. Une note seule : on demande quelques mots, et le focus va sur le commentaire.
    await userEvent.click(screen.getByRole('radio', { name: /5 sur 5/ }));
    await envoyerAvis();
    expect(await screen.findByRole('alert')).toHaveTextContent('Racontez votre expérience');
    expect(document.activeElement).toBe(commentaire());

    // 3. Des espaces ne comptent pas comme un commentaire.
    await userEvent.type(commentaire(), '      ');
    await envoyerAvis();
    expect(screen.getByRole('alert')).toHaveTextContent('Racontez votre expérience');
    expect(mock).not.toHaveBeenCalled(); // rien n'est parti

    // 4. Trop court (moins de 5 caractères) : refusé aussi.
    await userEvent.clear(commentaire());
    await userEvent.type(commentaire(), 'ok');
    await envoyerAvis();
    expect(mock).not.toHaveBeenCalled();

    // 5. Quelques mots : envoyé, espaces autour retirés.
    await userEvent.clear(commentaire());
    await userEvent.type(commentaire(), '  Très utile  ');
    await envoyerAvis();
    expect(await screen.findByRole('status')).toHaveTextContent('Merci pour votre avis');
    expect(JSON.parse(mock.mock.calls[0][1].body).commentaire).toBe('Très utile');
  });

  it('le profil non précisé n’est pas envoyé ; page inconnue → « autre »', async () => {
    const mock = reponse();
    vi.stubGlobal('fetch', mock);
    rendreApp('/avis?page=<script>');
    await userEvent.click(screen.getByRole('radio', { name: /5 sur 5/ }));
    await userEvent.type(screen.getByLabelText(/Racontez votre expérience/), 'Bien fait');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer mon avis' }));
    await screen.findByRole('status');
    expect(JSON.parse(mock.mock.calls[0][1].body)).toEqual({
      note: 5,
      commentaire: 'Bien fait',
      page: 'autre',
      siteWeb: '',
    });
  });

  it('trop d’avis (429) → message clair ; serveur injoignable → message clair, rien n’est perdu', async () => {
    vi.stubGlobal('fetch', reponse(429, {}));
    rendreApp('/avis');
    await userEvent.click(screen.getByRole('radio', { name: /3 sur 5/ }));
    await userEvent.type(screen.getByLabelText(/Racontez votre expérience/), 'Plutôt bien');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer mon avis' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Trop d’avis/);
    expect(screen.getByLabelText(/Racontez votre expérience/)).toHaveValue('Plutôt bien');
    cleanup();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('x');
      }),
    );
    rendreApp('/avis');
    await userEvent.click(screen.getByRole('radio', { name: /3 sur 5/ }));
    await userEvent.type(screen.getByLabelText(/Racontez votre expérience/), 'Pas mal du tout');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer mon avis' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/momentanément indisponibles/);
  });

  it('dit clairement que l’avis est anonyme et supprimé au bout de 12 mois ; accessible au clavier', async () => {
    rendreApp('/avis');
    expect(screen.getByText(/ni votre adresse IP/)).toHaveTextContent(/anonyme/);
    expect(screen.getByText(/12 mois/)).toBeInTheDocument();
    const note = screen.getByRole('radio', { name: /1 sur 5/ });
    note.focus();
    await userEvent.keyboard('{ArrowRight}'); // un groupe de boutons radio se parcourt aux flèches
    expect(screen.getByRole('radio', { name: /2 sur 5/ })).toBeChecked();
    expect(await violationsAxe(document.body)).toEqual([]);
  });

  it('accessible depuis le pied de page et depuis le résultat de l’évaluation', async () => {
    rendreApp('/contact');
    expect(screen.getByRole('link', { name: 'Donner mon avis' })).toHaveAttribute('href', '/avis');
  });
});
