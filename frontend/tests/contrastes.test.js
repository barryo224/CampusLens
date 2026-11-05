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

describe('Texte du bandeau d’accueil sur la photo', () => {
  // Pire cas : un pixel BLANC de la photo derrière le texte. Le voile bleu (rgba(11,58,70,a)) et le fond bleu du
  // bandeau doivent suffire à garder le texte lisible (WCAG AA : 4,5:1 pour le texte courant).
  const voile = [11, 58, 70];
  const fond = [0x0f, 0x4c, 0x5a];
  const hex = (c) => `#${c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;
  const melange = (dessous, dessus, alpha) =>
    dessous.map((x, i) => x * (1 - alpha) + dessus[i] * alpha);
  const pireCas = (alphaVoile, visibilitePhoto) => {
    const photoBlanche = melange([255, 255, 255], voile, alphaVoile); // photo la plus claire possible sous le voile
    return melange(fond, photoBlanche, visibilitePhoto); // puis fondue sur le bleu du bandeau
  };
  // Le voile est défini sur plusieurs lignes dans le CSS : on lit ses deux premières opacités quelle que soit la mise en forme.
  const voileCss = css.slice(css.indexOf('.hero-photo::after'));
  const opacites = [...voileCss.matchAll(/rgba\(11,\s*58,\s*70,\s*([\d.]+)\)/g)].map((m) =>
    Number(m[1]),
  );
  const [alphaHaut, alphaMilieu] = opacites;

  it('le voile est assez fort là où se trouve le texte (haut et milieu de la zone de texte)', () => {
    expect(alphaHaut).toBeGreaterThanOrEqual(0.9);
    expect(alphaMilieu).toBeGreaterThanOrEqual(0.75);
  });
  it('description (blanc cassé) lisible même sur une photo blanche : ≥ 4,5:1', () => {
    expect(contraste('#eef6f7', hex(pireCas(alphaMilieu, 0.9)))).toBeGreaterThanOrEqual(4.5);
  });
  it('titre blanc et accroche orange sur le bandeau bleu : ≥ 4,5:1', () => {
    expect(contraste('#ffffff', hex(pireCas(alphaHaut, 0.9)))).toBeGreaterThanOrEqual(4.5);
    expect(contraste(couleur('accent-clair'), hex(fond))).toBeGreaterThanOrEqual(4.5);
  });
  it('boutons du bandeau : texte bleu sur blanc, et blanc sur fond bleu (bouton secondaire)', () => {
    expect(contraste(couleur('primaire'), '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contraste('#ffffff', hex(fond))).toBeGreaterThanOrEqual(4.5);
  });
});
