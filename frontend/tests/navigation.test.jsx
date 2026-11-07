import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rendreApp, simulerApi } from './helpers/rendu.jsx';
import { AIDES_ACCUEIL } from './helpers/donnees.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Navigation', () => {
  it('la barre latérale contient les 6 pages', () => {
    simulerApi({ '/aides': AIDES_ACCUEIL });
    rendreApp('/');
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    const noms = within(nav)
      .getAllByRole('link')
      .map((l) => l.textContent);
    expect(noms).toEqual([
      'Accueil',
      'Évaluer ma situation',
      'Mes aides',
      'Préparer mon budget',
      'Ressources',
      'À propos',
    ]);
  });

  it('l’élément actif est marqué (aria-current) et suit la page', async () => {
    simulerApi({ '/aides': AIDES_ACCUEIL });
    rendreApp('/');
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    expect(within(nav).getByRole('link', { name: 'Accueil' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'À propos' })).not.toHaveAttribute('aria-current');

    await userEvent.click(within(nav).getByRole('link', { name: 'À propos' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'À propos' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'À propos' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Accueil' })).not.toHaveAttribute('aria-current');
    expect(document.title).toBe('À propos · CampusLens');
  });

  it('propose un lien d’évitement vers le contenu (clavier)', () => {
    simulerApi({ '/aides': AIDES_ACCUEIL });
    rendreApp('/');
    expect(screen.getByRole('link', { name: 'Aller au contenu' })).toHaveAttribute(
      'href',
      '#contenu',
    );
  });

  it('adresse inconnue : page « introuvable », pas de page blanche', () => {
    rendreApp('/nimporte-quoi');
    expect(screen.getByRole('heading', { level: 1, name: 'Page introuvable' })).toBeInTheDocument();
    // Une page qui n'existe pas ne doit pas promettre qu'elle « arrive bientôt » : elle propose de revenir à l'accueil.
    expect(screen.getByText('Cette page n’existe pas ou a été déplacée.')).toBeInTheDocument();
    expect(screen.queryByText(/arrive très bientôt/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Retour à l’accueil' })).toHaveAttribute('href', '/');
  });
});
