import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(import.meta.dirname, '../src/styles/global.css'), 'utf8');

describe('Styles de survol des choix, cases, pastilles et onglets', () => {
  // Extrait le contenu du bloc @media (hover: hover) ajouté pour ces éléments.
  const debut = css.indexOf('/* Cartes de choix');
  const bloc = css.slice(debut, css.indexOf('\n}\n', debut));
  const ouverture = css.lastIndexOf('@media (hover: hover) and (pointer: fine) {', debut);

  it('le survol est réservé aux appareils avec souris (sur téléphone, il « collerait » après un toucher)', () => {
    expect(debut).toBeGreaterThan(-1);
    expect(ouverture).toBeGreaterThan(-1);
    expect(css.slice(ouverture, debut)).not.toContain('\n}\n'); // ce bloc est bien dans la requête « souris seulement »
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

  it('liens : un petit mouvement au survol (le trait descend, le menu glisse), jamais de soulignement dans les menus', () => {
    const debut = css.indexOf('/* Liens dans les contenus');
    expect(debut).toBeGreaterThan(-1);
    const ouverture = css.lastIndexOf('@media (hover: hover) and (pointer: fine) {', debut);
    expect(css.slice(ouverture, debut)).not.toContain('\n}\n'); // dans la requête « souris seulement »
    const sansEspaces = (t) => t.replace(/\s+/g, '');
    // Contenus : le trait souligné descend et s'épaissit (transition douce sur l'écart du trait).
    const contenus = sansEspaces(css.slice(debut, css.indexOf('}', debut)));
    expect(contenus).toContain('text-underline-offset:5px');
    expect(contenus).toContain('text-decoration-thickness:2px');
    expect(sansEspaces(css)).toContain('transition:color0.15sease,text-underline-offset0.18sease');
    // Menus et pied de page : glissement vers la droite, aucun soulignement.
    const menus = css.indexOf('/* Menus et pied de page');
    const regleMenus = sansEspaces(css.slice(menus, css.indexOf('}', menus)));
    expect(regleMenus).toContain('.nava:hover,.admin-nava:hover,.pieda:hover'); // (sans espaces)
    expect(regleMenus).toContain('transform:translateX(4px)');
    expect(regleMenus).toContain('text-decoration:none');
    expect(regleMenus).not.toContain('underline');
    // Les boutons, le logo et les cartes cliquables gardent leur effet propre.
    for (const exclu of ['.bouton', '.raccourci']) expect(contenus).toContain(`:not(${exclu})`);
  });
});
