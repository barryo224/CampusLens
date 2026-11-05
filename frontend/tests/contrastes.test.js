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

describe('Photo derrière la mission (À propos)', () => {
  const opacite = Number(css.match(/--mission-image-opacite:\s*([\d.]+)/)[1]);
  // Pire cas : un pixel NOIR de la photo, mélangé au fond avec cette opacité.
  const melange = (fond, o) => {
    const canaux = [1, 3, 5].map((i) => Math.round(parseInt(fond.slice(i, i + 2), 16) * (1 - o)));
    return `#${canaux.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  };
  it('reste faible (≤ 0,25)', () => {
    expect(opacite).toBeGreaterThan(0);
    expect(opacite).toBeLessThanOrEqual(0.25);
  });
  it('garantit le contraste AA du texte de la mission même sur les zones les plus sombres de la photo', () => {
    const pireFond = melange(couleur('fond'), opacite);
    expect(contraste(couleur('primaire'), pireFond)).toBeGreaterThanOrEqual(4.5); // « Aider chaque étudiant… »
    expect(contraste(couleur('primaire'), pireFond)).toBeGreaterThanOrEqual(4.5); // « Notre mission »
  });
});

describe('Texte du bandeau d’accueil posé sur la photo', () => {
  // Pire cas : un pixel BLANC de la photo derrière le texte. Le voile bleu nuit (rgba(8,28,36,a)) doit suffire à
  // garder le texte lisible (WCAG AA : 4,5:1 pour le texte courant, 3:1 pour le très gros texte).
  const voile = [8, 28, 36];
  const hex = (c) => `#${c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;
  const pireFond = (alpha) => hex(voile.map((v) => v * alpha + 255 * (1 - alpha)));
  const alpha = (nom) => Number(css.match(new RegExp(`--${nom}:\\s*([\\d.]+)`))[1]);

  it('le voile est plus dense là où se trouve le texte (haut et bas), léger au milieu (visages)', () => {
    expect(alpha('voile-haut')).toBeGreaterThanOrEqual(0.7);
    expect(alpha('voile-titre')).toBeGreaterThanOrEqual(0.55);
    expect(alpha('voile-texte-bas')).toBeGreaterThanOrEqual(0.7);
    expect(alpha('voile-fin')).toBeGreaterThanOrEqual(alpha('voile-texte-bas'));
    // Le milieu du bandeau (visages) n'a AUCUN voile : la photo y est intacte.
    expect(css).toMatch(/rgba\(8, 28, 36, 0\) 38%,\s*rgba\(8, 28, 36, 0\) 60%/);
  });
  it('accroche (petit texte blanc, en haut) : ≥ 4,5:1 même sur une photo blanche', () => {
    expect(contraste('#ffffff', pireFond(alpha('voile-haut')))).toBeGreaterThanOrEqual(4.5);
  });
  it('titre (très gros texte blanc) : ≥ 3:1 même sur une photo blanche', () => {
    expect(contraste('#ffffff', pireFond(alpha('voile-titre')))).toBeGreaterThanOrEqual(3);
  });
  it('description (blanc cassé) et boutons : ≥ 4,5:1 même sur une photo blanche', () => {
    expect(contraste('#f1f7f8', pireFond(alpha('voile-texte-bas')))).toBeGreaterThanOrEqual(4.5);
    expect(contraste('#ffffff', pireFond(alpha('voile-texte-bas')))).toBeGreaterThanOrEqual(4.5); // bouton secondaire
  });
  it('bouton principal : texte bleu sur blanc ≥ 4,5:1', () => {
    expect(contraste(couleur('primaire'), '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
  it('la photo n’est plus recouverte d’un bandeau vert plein : le fond du bandeau est un bleu nuit neutre', () => {
    expect(css).toMatch(/\.hero \{[^}]*background: #0c262e/s);
    expect(css).not.toMatch(/\.hero \{[^}]*background: linear-gradient\(160deg/s);
  });
});
