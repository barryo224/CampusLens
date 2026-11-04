// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// WCAG AA : texte normal ≥ 4,5:1. On lit les couleurs dans le CSS : impossible d'oublier un changement.
const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');
const couleur = (nom) => css.match(new RegExp(`--${nom}:\\s*(#[0-9a-fA-F]{6})`))[1];

function luminance(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const BLANC = '#ffffff';
const PAIRES = [
  ['texte', 'carte'],
  ['texte', 'fond'],
  ['texte-doux', 'carte'],
  ['texte-doux', 'fond'],
  ['primaire', 'carte'],
  ['primaire', 'primaire-clair'],
  ['texte', 'primaire-clair'],
  ['vert', 'vert-fond'],
  ['orange', 'orange-fond'],
  ['rouge', 'rouge-fond'],
];

describe('Contrastes WCAG AA (≥ 4,5:1)', () => {
  for (const [texte, fond] of PAIRES) {
    it(`${texte} sur ${fond}`, () => {
      expect(contraste(couleur(texte), couleur(fond))).toBeGreaterThanOrEqual(4.5);
    });
  }
  it('blanc sur la barre latérale et sur les boutons', () => {
    expect(contraste(BLANC, couleur('sidebar'))).toBeGreaterThanOrEqual(4.5);
    expect(contraste(BLANC, couleur('primaire'))).toBeGreaterThanOrEqual(4.5);
  });
  it('vert / orange / rouge de statut sur blanc', () => {
    for (const c of ['vert', 'orange', 'rouge']) {
      expect(contraste(couleur(c), BLANC), c).toBeGreaterThanOrEqual(4.5);
    }
  });
});
