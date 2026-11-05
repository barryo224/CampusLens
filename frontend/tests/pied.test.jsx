import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, within, cleanup } from '@testing-library/react';
import { rendreApp, simulerApi } from './helpers/rendu.jsx';
import {
  AIDES_ACCUEIL,
  RESSOURCES_API,
  PARAMETRES_API,
  POSTES_API,
  reponseAides,
} from './helpers/donnees.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PAGES_PUBLIQUES = [
  '/',
  '/evaluer',
  '/aides',
  '/budget',
  '/ressources',
  '/a-propos',
  '/contact',
  '/mentions-legales',
  '/page-inconnue',
];

describe('Pied de page commun', () => {
  it('toutes les pages publiques ont UN SEUL pied de page, identique', async () => {
    simulerApi({
      '/aides': reponseAides,
      '/ressources': RESSOURCES_API,
      '/parametres': PARAMETRES_API,
      '/postes-rentree': POSTES_API,
      '/villes': [],
      '/associations': [],
    });
    let reference = null;
    for (const chemin of PAGES_PUBLIQUES) {
      rendreApp(chemin);
      const pieds = screen.getAllByRole('contentinfo');
      expect(pieds, chemin).toHaveLength(1);
      const liens = within(pieds[0])
        .getAllByRole('link')
        .map((l) => `${l.textContent.trim()} → ${l.getAttribute('href')}`);
      reference ??= { texte: pieds[0].textContent, liens };
      expect(pieds[0].textContent, chemin).toBe(reference.texte);
      expect(liens, chemin).toEqual(reference.liens);
      cleanup();
    }
    expect(reference.liens).toEqual(
      expect.arrayContaining([
        'Ressources → /ressources',
        'Mes aides → /aides',
        'Contact → /contact',
        'Mentions légales et confidentialité → /mentions-legales',
      ]),
    );
  });

  it('le pied de page est hors du contenu principal (repère « contentinfo » valide) et reste après lui', async () => {
    simulerApi({ '/aides': AIDES_ACCUEIL });
    rendreApp('/');
    const principal = screen.getByRole('main');
    const pied = screen.getByRole('contentinfo');
    expect(principal.contains(pied)).toBe(false);
    expect(principal.compareDocumentPosition(pied) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('les crédits photo sont dans le pied de page commun (et plus dans la page À propos)', async () => {
    rendreApp('/a-propos');
    const pied = screen.getByRole('contentinfo');
    expect(
      within(pied).getByText(/Photos du bandeau d’accueil et de la page À propos/),
    ).toBeInTheDocument();
    const lien = within(pied).getByRole('link', { name: /Pexels/ });
    expect(lien).toHaveAttribute('href', 'https://www.pexels.com');
    expect(lien).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('main')).not.toHaveTextContent(/Photo de la mission/);
  });

  it('l’espace administration garde sa propre mise en page : pas de pied de page public', async () => {
    simulerApi({ '/admin/me': { __status: 401 } });
    rendreApp('/admin');
    await screen.findByRole('heading', { name: 'Connexion' });
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });
});
