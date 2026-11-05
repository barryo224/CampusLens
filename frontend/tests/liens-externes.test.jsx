import { describe, it, expect, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, cleanup } from '@testing-library/react';
import LienExterne from '../src/components/LienExterne.jsx';

afterEach(cleanup);

const fichiersJsx = (dossier) =>
  readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiersJsx(chemin);
    return chemin.endsWith('.jsx') ? [chemin] : [];
  });

describe('Liens qui sortent de la page', () => {
  it('LienExterne : nouvel onglet, rel sécurisé, annonce « nouvel onglet » aux lecteurs d’écran', () => {
    render(<LienExterne href="https://www.caf.fr">Simuler sur caf.fr</LienExterne>);
    const lien = screen.getByRole('link', { name: 'Simuler sur caf.fr (nouvel onglet)' });
    expect(lien).toHaveAttribute('href', 'https://www.caf.fr');
    expect(lien).toHaveAttribute('target', '_blank');
    expect(lien).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('un lien qui porte déjà son libellé (aria-label) n’ajoute pas la mention en double', () => {
    render(
      <LienExterne
        href="https://exemple.test"
        annonce={false}
        aria-label="Ouvrir : Guide (nouvel onglet)"
      >
        →
      </LienExterne>,
    );
    const lien = screen.getByRole('link', { name: 'Ouvrir : Guide (nouvel onglet)' });
    expect(lien).toHaveAttribute('target', '_blank');
    expect(lien.textContent).toBe('→');
  });

  it('GARDE : aucun lien externe n’est écrit à la main, tous passent par LienExterne', () => {
    const fautifs = [];
    for (const fichier of fichiersJsx('src')) {
      if (fichier.endsWith('LienExterne.jsx')) continue;
      const source = readFileSync(fichier, 'utf8');
      for (const [balise] of source.matchAll(/<a\b[^>]*>/gs)) {
        const href = balise.match(/href=(?:"([^"]*)"|\{([^}]*(?:\{[^}]*\}[^}]*)*)\})/s);
        if (!href) continue;
        const valeur = href[1] ?? href[2];
        const interne = /^(#|\/|mailto:|`mailto:)/.test(valeur.trim());
        if (!interne) fautifs.push(`${fichier} : ${balise.replace(/\s+/g, ' ').slice(0, 90)}`);
      }
    }
    expect(fautifs, 'Utilisez <LienExterne> pour tout lien qui sort de la page').toEqual([]);
  });

  it('GARDE : aucun lien interne à la main non plus (ils utilisent <Link>, sans recharger la page)', () => {
    const fautifs = [];
    for (const fichier of fichiersJsx('src')) {
      const source = readFileSync(fichier, 'utf8');
      for (const [balise] of source.matchAll(/<a\b[^>]*>/gs)) {
        const href = balise.match(/href="(\/[^"]*)"/);
        if (href && !fichier.endsWith('LienExterne.jsx') && href[1] !== '/')
          fautifs.push(`${fichier} : ${href[1]}`);
      }
    }
    expect(fautifs).toEqual([]);
  });
});
