import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ResultatsVisibles } from '../src/components/SuiviNavigation.jsx';
import { rendreApp, simulerApi } from './helpers/rendu.jsx';

beforeEach(() => {
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Changer de page remonte en haut', () => {
  it('un lien du pied de page (Contact) ramène en haut de la nouvelle page et place le focus sur le contenu', async () => {
    simulerApi({ '/aides': [], '/ressources': [] });
    rendreApp('/a-propos');
    await screen.findByRole('heading', { level: 1, name: 'À propos' });
    window.scrollTo.mockClear();

    const pied = screen.getByRole('contentinfo');
    await userEvent.click(within(pied).getByRole('link', { name: 'Contact' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Nous contacter' }),
    ).toBeInTheDocument();
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    expect(document.getElementById('contenu')).toHaveFocus();
  });

  it('changer d’onglet ou de filtre dans une même page ne fait pas bouger l’écran', async () => {
    simulerApi({ '/aides': [], '/associations': [], '/villes': [] });
    rendreApp('/aides');
    await screen.findByRole('tab', { name: 'Associations & entraide' });
    window.scrollTo.mockClear();
    await userEvent.click(screen.getByRole('tab', { name: 'Associations & entraide' }));
    await screen.findByRole('tabpanel');
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});

describe('Le résultat d’une action est toujours visible', () => {
  const monter = () =>
    render(
      <MemoryRouter>
        <ResultatsVisibles />
        <div id="zone" />
      </MemoryRouter>,
    );
  const ajouter = (html) => {
    const zone = document.getElementById('zone');
    const el = document.createElement('div');
    el.innerHTML = html;
    zone.appendChild(el.firstElementChild);
    return zone.lastElementChild;
  };
  const horsEcran = () =>
    vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockReturnValue({ top: 3000, bottom: 3060, left: 0, right: 100, width: 100, height: 60 });
  const visible = () =>
    vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockReturnValue({ top: 200, bottom: 260, left: 0, right: 100, width: 100, height: 60 });

  it('un message qui apparaît hors de l’écran juste après un geste fait défiler jusqu’à lui', async () => {
    monter();
    horsEcran();
    await userEvent.click(document.body);
    ajouter('<p role="status">Message envoyé. Merci.</p>');
    await waitFor(() =>
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
        block: 'center',
        behavior: 'smooth',
      }),
    );
  });

  it('une erreur (role alert) est traitée de la même façon', async () => {
    monter();
    horsEcran();
    await userEvent.click(document.body);
    ajouter('<p role="alert">Une erreur est survenue.</p>');
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
  });

  it('un message déjà visible ne fait rien bouger', async () => {
    monter();
    visible();
    await userEvent.click(document.body);
    ajouter('<p role="status">Enregistré.</p>');
    await new Promise((r) => setTimeout(r, 30));
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it('les textes réservés aux lecteurs d’écran et les messages sans geste préalable sont ignorés', async () => {
    monter();
    horsEcran();
    // pas de geste : rien
    ajouter('<p role="status">Apparu tout seul.</p>');
    await new Promise((r) => setTimeout(r, 30));
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    // geste, mais texte « sr-only »
    await userEvent.click(document.body);
    ajouter('<p role="status" class="sr-only">3 villes affichées</p>');
    await new Promise((r) => setTimeout(r, 30));
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});
