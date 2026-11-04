import { describe, it, expect } from 'vitest';
import { choisirRecommandations } from '../src/lib/recommandations.js';
import { positionJauge } from '../src/lib/jauge.js';
import { construireBilan } from '../src/lib/bilan.js';
import { calculerResteAVivre } from '../src/lib/simulation.js';

const PARAMS = [
  { cle: 'droits_inscription', niveau: 'licence', profil: null, valeur: 178 },
  { cle: 'droits_inscription', niveau: 'licence', profil: 'intl', valeur: 2902 },
  { cle: 'cvec', niveau: 'aucun', profil: null, valeur: 105 },
  { cle: 'seuil_fragile', niveau: 'aucun', profil: null, valeur: 150 },
  { cle: 'seuil_part_loyer', niveau: 'aucun', profil: null, valeur: 40 },
];
const BUDGET = {
  job: 600,
  famille: 250,
  loyer: 637,
  alimentation: 200,
  transport: 30,
  telephone: 20,
  sante: 15,
  autres: 50,
};
const FR = { statut: 'fr_ue', niveau: 'licence', boursier: false, exonere: false };
const calcul = (profil, saisie, params = PARAMS) => calculerResteAVivre(profil, saisie, params);
const ids = (profil, saisie, params = PARAMS) =>
  choisirRecommandations({
    profil,
    resultat: calcul(profil, saisie, params),
    parametres: params,
  }).map((r) => r.id);

describe('choisirRecommandations', () => {
  it('budget en difficulté, loyer lourd, non boursier : bourse, loyer, urgence, courses', () => {
    expect(ids(FR, BUDGET)).toEqual(['bourse', 'loyer', 'urgence', 'courses']);
  });
  it('boursier : pas de « tester la bourse »', () => {
    expect(ids({ ...FR, boursier: true }, BUDGET)).not.toContain('bourse');
  });
  it('part du loyer sous le seuil de la base : pas de conseil loyer ; le seuil est lu en base', () => {
    const peuDeLoyer = { ...BUDGET, loyer: 100 };
    expect(ids(FR, peuDeLoyer)).not.toContain('loyer');
    const seuilBas = PARAMS.map((p) => (p.cle === 'seuil_part_loyer' ? { ...p, valeur: 10 } : p));
    expect(ids(FR, peuDeLoyer, seuilBas)).toContain('loyer');
  });
  it('seuil de loyer absent de la base : on ignore la règle, on n’invente rien', () => {
    const sans = PARAMS.filter((p) => p.cle !== 'seuil_part_loyer');
    expect(ids(FR, BUDGET, sans)).not.toContain('loyer');
  });
  it('international non exonéré : propose l’exonération (max 4 conseils)', () => {
    const intl = { ...FR, statut: 'intl' };
    const r = choisirRecommandations({
      profil: intl,
      resultat: calcul(intl, BUDGET),
      parametres: PARAMS,
    });
    expect(r.length).toBeLessThanOrEqual(4);
    expect(ids({ ...intl, boursier: true }, {})).not.toContain('exoneration');
    expect(ids({ ...intl, exonere: true }, {})).not.toContain('exoneration');
    expect(ids(intl, { job: 5000 })).not.toContain('urgence');
  });
  it('budget équilibré : message positif, ni urgence ni courses', () => {
    const r = ids(FR, { job: 5000, loyer: 300 });
    expect(r).toContain('equilibre');
    expect(r).not.toContain('urgence');
    expect(r).not.toContain('courses');
  });
  it('chaque conseil a un lien interne', () => {
    const r = choisirRecommandations({
      profil: FR,
      resultat: calcul(FR, BUDGET),
      parametres: PARAMS,
    });
    for (const c of r) expect(c.lien.vers).toMatch(/^\//);
  });
});

describe('positionJauge', () => {
  it('rouge à gauche, orange au centre, vert à droite (échelle déduite du seuil)', () => {
    expect(positionJauge(-150, 150)).toBe(0);
    expect(positionJauge(0, 150)).toBeCloseTo(1 / 3);
    expect(positionJauge(150, 150)).toBeCloseTo(2 / 3);
    expect(positionJauge(300, 150)).toBe(1);
  });
  it('reste dans [0 ; 1] même pour des valeurs extrêmes', () => {
    expect(positionJauge(-99999, 150)).toBe(0);
    expect(positionJauge(99999, 150)).toBe(1);
  });
  it('seuil absent ou nul : position raisonnable, sans division par zéro', () => {
    expect(positionJauge(-10, 0)).toBeLessThan(0.5);
    expect(positionJauge(10, 0)).toBeGreaterThan(0.5);
    expect(Number.isFinite(positionJauge(5, undefined))).toBe(true);
  });
});

describe('construireBilan', () => {
  const resultat = calcul(FR, BUDGET);
  const bilan = construireBilan({
    profil: FR,
    saisie: BUDGET,
    resultat,
    recommandations: [{ titre: 'Aide', texte: 'Texte' }],
    sources: [
      { organisme: 'FAGE', verifieLe: null },
      { organisme: 'DILA', verifieLe: '2026-09-01T00:00:00Z' },
    ],
    date: new Date('2026-11-05T10:00:00Z'),
  });
  it('contient profil, date, montants et résultat', () => {
    expect(bilan.date).toBe('5 novembre 2026');
    expect(bilan.profil).toBe('Étudiant français ou UE · Licence');
    expect(bilan.revenus[0]).toEqual(['Job étudiant (net)', expect.stringMatching(/600,00/)]);
    expect(bilan.reste).toMatch(/-125,58/);
    expect(bilan.niveau).toBe('Situation en difficulté');
  });
  it('n’utilise pas d’espaces insécables (illisibles dans le PDF) et signale « à vérifier »', () => {
    expect(JSON.stringify(bilan)).not.toMatch(new RegExp('[\u202f\u00a0]'));
    expect(bilan.sources[0]).toBe('FAGE (à vérifier)');
    expect(bilan.sources[1]).toMatch(/DILA, vérifié le 1 septembre 2026/);
  });
  it('décrit les profils boursier, master et exonéré', () => {
    const b = construireBilan({
      profil: { statut: 'intl', niveau: 'master', boursier: true, exonere: true },
      saisie: {},
      resultat: calcul({ ...FR, boursier: true }, {}),
      recommandations: [],
      sources: [],
    });
    expect(b.profil).toBe(
      'Étudiant international hors UE · Master · boursier CROUS · exonéré des droits différenciés',
    );
  });
});
