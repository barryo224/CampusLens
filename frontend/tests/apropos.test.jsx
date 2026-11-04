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
    expect(screen.getByText(/Aider chaque étudiant à connaître ses droits/)).toBeInTheDocument();
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

  it('accessibilité : aucune violation axe-core', async () => {
    const { container } = rendreApp('/a-propos');
    expect(await violationsAxe(container)).toEqual([]);
  });
});
