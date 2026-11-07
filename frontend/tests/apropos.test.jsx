import { describe, it, expect, afterEach } from 'vitest';
import { screen, within, cleanup } from '@testing-library/react';
import { rendreApp, violationsAxe } from './helpers/rendu.jsx';

afterEach(cleanup);

describe('Page À propos', () => {
  it('affiche les 4 principes, la mission et le pied de page', () => {
    rendreApp('/a-propos');
    for (const titre of ['Informations fiables', 'Transparence', 'Gratuit et anonyme', 'Utile']) {
      expect(screen.getByRole('heading', { name: titre })).toBeInTheDocument();
    }
    expect(
      screen.getByText(/Aider chaque étudiant à s’informer, à se préparer/),
    ).toBeInTheDocument();
    const pied = screen.getByText('Liens utiles').closest('footer');
    expect(within(pied).getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/contact');
    expect(within(pied).getByRole('link', { name: 'Ressources' })).toHaveAttribute(
      'href',
      '/ressources',
    );
    expect(within(pied).getByRole('link', { name: /Mentions légales/ })).toHaveAttribute(
      'href',
      '/mentions-legales',
    );
  });

  it('explique les sources, les mises à jour, « vérification en cours », l’anonymat et les limites', () => {
    rendreApp('/a-propos');
    for (const titre of [
      'D’où viennent les informations',
      'Comment les informations restent à jour',
      /Que veut dire « vérification en cours »/,
      'Vos données et votre anonymat',
      'Les limites à connaître',
      'Qui est derrière CampusLens',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: titre })).toBeInTheDocument();
    }
    expect(screen.getByText(/Aucun cookie n’est déposé aux visiteurs/)).toBeInTheDocument();
    expect(screen.getByText(/Ousmane Barry/)).toBeInTheDocument();
    expect(screen.getByText(/ne remplace ni le Crous, ni/)).toBeInTheDocument();
  });

  it('chaque source est un lien officiel qui s’ouvre dans un nouvel onglet ; les liens internes restent dans le site', () => {
    rendreApp('/a-propos');
    const sources = screen.getByRole('region', { name: 'D’où viennent les informations' });
    const liens = within(sources).getAllByRole('link');
    expect(liens.length).toBeGreaterThanOrEqual(6);
    for (const lien of liens) {
      expect(lien.getAttribute('href')).toMatch(/^https:\/\//);
      expect(lien).toHaveAttribute('target', '_blank');
      expect(lien).toHaveAttribute('rel', 'noopener noreferrer');
    }
    expect(screen.getByRole('link', { name: 'Nous écrire' })).toHaveAttribute('href', '/contact');
    // Le même lien existe dans le pied de page : celui de cette page garde l'origine de l'avis.
    expect(
      screen
        .getAllByRole('link', { name: 'Donner mon avis' })
        .map((l) => l.getAttribute('href'))
        .sort(),
    ).toEqual(['/avis', '/avis?page=a_propos']);
    expect(screen.getByRole('link', { name: 'mentions légales' })).not.toHaveAttribute('target');
  });

  it('accessibilité : aucune violation axe-core', async () => {
    const { container } = rendreApp('/a-propos');
    expect(await violationsAxe(container)).toEqual([]);
  });
});
