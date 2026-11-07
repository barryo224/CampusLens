import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(import.meta.dirname, '../src/styles/global.css'), 'utf8');

describe('Styles de survol des choix, cases, pastilles et onglets', () => {
  // Extrait le contenu du bloc @media (hover: hover) ajouté pour ces éléments.
  const debut = css.indexOf('@media (hover: hover) and (pointer: fine) {\n  /* Cartes de choix');
  const bloc = css.slice(debut, css.indexOf('\n}\n', debut));

  it('le survol est réservé aux appareils avec souris (sur téléphone, il « collerait » après un toucher)', () => {
    expect(debut).toBeGreaterThan(-1);
    for (const regle of [
      '.choix:not(.choix-actif):hover',
      '.case:hover',
      '.pastille:not(.pastille-active):hover',
      ".onglets [role='tab']:not([aria-selected='true']):hover",
    ])
      expect(bloc).toContain(regle);
  });

  it('aucune de ces règles de survol n’existe en dehors de ce bloc', () => {
    const horsBloc = css.slice(0, debut) + css.slice(debut + bloc.length);
    for (const regle of [
      '.choix:not(.choix-actif):hover',
      '.case:hover',
      '.pastille:not(.pastille-active):hover',
    ])
      expect(horsBloc).not.toContain(regle);
  });

  it('le survol ne change ni la taille ni la position (couleur et bordure seulement)', () => {
    for (const interdit of [
      'width',
      'height',
      'padding',
      'margin',
      'transform',
      'font-size',
      'display',
      'position',
    ])
      expect(bloc).not.toMatch(new RegExp(`\\b${interdit}\\s*:`));
  });
});
