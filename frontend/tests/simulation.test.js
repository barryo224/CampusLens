import { describe, it, expect } from 'vitest';
import {
  analyserMontant,
  calculerResteAVivre,
  nombreSaisi,
  trouverParametre,
} from '../src/lib/simulation.js';

// Paramètres de test FIXES (même forme que GET /api/parametres).
const PARAMS = [
  { cle: 'droits_inscription', niveau: 'licence', profil: null, valeur: 178 },
  { cle: 'droits_inscription', niveau: 'master', profil: null, valeur: 254 },
  { cle: 'droits_inscription', niveau: 'licence', profil: 'intl', valeur: 2902 },
  { cle: 'droits_inscription', niveau: 'master', profil: 'intl', valeur: 3950 },
  { cle: 'cvec', niveau: 'aucun', profil: null, valeur: 105 },
  { cle: 'seuil_fragile', niveau: 'aucun', profil: null, valeur: 150 },
];

// Budget de référence : revenus 850 € ; dépenses 952 €.
const BUDGET = {
  job: 600,
  famille: 250,
  bourse: 0,
  aideLogement: 0,
  loyer: 637,
  alimentation: 200,
  transport: 30,
  telephone: 20,
  sante: 15,
  autres: 50,
};

const francais = { statut: 'fr_ue', niveau: 'licence', boursier: false };

describe('calculerResteAVivre', () => {
  it('SIM-01 : français licence, non boursier', () => {
    const r = calculerResteAVivre(francais, BUDGET, PARAMS);
    expect(r.totalRevenus).toBe(850);
    expect(r.totalDepenses).toBe(952);
    expect(r.fraisMensuels).toBe(23.58);
    expect(r.resteAVivre).toBe(-125.58);
    expect(r.niveau).toBe('en_difficulte');
    expect(r.libelleNiveau).toBe('en difficulté');
  });

  it('SIM-02 : international licence, non exonéré', () => {
    const r = calculerResteAVivre({ statut: 'intl', niveau: 'licence' }, BUDGET, PARAMS);
    expect(r.fraisMensuels).toBe(250.58);
    expect(r.resteAVivre).toBe(-352.58);
    expect(r.niveau).toBe('en_difficulte');
  });

  it('SIM-03 : international licence, exonéré → tarif national', () => {
    const r = calculerResteAVivre(
      { statut: 'intl', niveau: 'licence', exonere: true },
      BUDGET,
      PARAMS,
    );
    expect(r.fraisMensuels).toBe(23.58);
    expect(r.resteAVivre).toBe(-125.58);
  });

  it('SIM-04 : international master, non exonéré', () => {
    const r = calculerResteAVivre({ statut: 'intl', niveau: 'master' }, BUDGET, PARAMS);
    expect(r.fraisMensuels).toBe(337.92);
    expect(r.resteAVivre).toBe(-439.92);
  });

  it('SIM-05 : boursier licence → frais 0', () => {
    const r = calculerResteAVivre({ ...francais, boursier: true }, BUDGET, PARAMS);
    expect(r.fraisMensuels).toBe(0);
    expect(r.droitsInscription).toBe(0);
    expect(r.cvec).toBe(0);
    expect(r.resteAVivre).toBe(-102);
  });

  it('SIM-06 : situation fragile (revenus 1 100 €)', () => {
    const r = calculerResteAVivre(francais, { ...BUDGET, job: 850 }, PARAMS);
    expect(r.resteAVivre).toBe(124.42);
    expect(r.niveau).toBe('fragile');
  });

  it('SIM-07 : situation équilibrée (revenus 1 200 €)', () => {
    const r = calculerResteAVivre(francais, { ...BUDGET, job: 950 }, PARAMS);
    expect(r.resteAVivre).toBe(224.42);
    expect(r.niveau).toBe('equilibre');
  });

  it('SIM-08 : limite zéro → « fragile » (et pas « en difficulté »)', () => {
    const boursier = { ...francais, boursier: true };
    const r = calculerResteAVivre(boursier, { ...BUDGET, job: 702 }, PARAMS); // 952 − 952
    expect(r.resteAVivre).toBe(0);
    expect(Object.is(r.resteAVivre, -0)).toBe(false);
    expect(r.niveau).toBe('fragile');
  });

  it('SIM-09 : limite seuil (150 €) → « équilibré »', () => {
    const boursier = { ...francais, boursier: true };
    const r = calculerResteAVivre(boursier, { ...BUDGET, job: 852 }, PARAMS); // 1 102 − 952
    expect(r.resteAVivre).toBe(150);
    expect(r.niveau).toBe('equilibre');
    const juste = calculerResteAVivre(boursier, { ...BUDGET, job: 851.99 }, PARAMS);
    expect(juste.resteAVivre).toBe(149.99);
    expect(juste.niveau).toBe('fragile');
  });

  it('SIM-10 : une saisie négative est traitée comme 0', () => {
    const r = calculerResteAVivre(francais, { ...BUDGET, loyer: -300 }, PARAMS);
    expect(r.totalDepenses).toBe(315); // 952 − 637
    const zero = calculerResteAVivre(francais, { ...BUDGET, loyer: 0 }, PARAMS);
    expect(r.resteAVivre).toBe(zero.resteAVivre);
  });

  it('SIM-11 : saisie vide ou texte → 0, sans erreur', () => {
    for (const valeur of ['', 'abc', null, undefined, NaN, Infinity, {}, [], '12abc', '1e5']) {
      const r = calculerResteAVivre(francais, { ...BUDGET, alimentation: valeur }, PARAMS);
      expect(r.totalDepenses, String(valeur)).toBe(752); // 952 − 200
    }
  });

  it('SIM-12 : tout à zéro → reste = −frais mensuels', () => {
    for (const saisie of [{}, undefined, null]) {
      const r = calculerResteAVivre(francais, saisie, PARAMS);
      expect(r.resteAVivre).toBe(-23.58);
      expect(r.niveau).toBe('en_difficulte');
    }
  });

  it('SIM-13 : si les paramètres changent, le résultat change sans toucher au code', () => {
    const params = PARAMS.map((p) =>
      p.cle === 'droits_inscription' && p.niveau === 'licence' && p.profil === null
        ? { ...p, valeur: 200 }
        : p,
    );
    const r = calculerResteAVivre(francais, BUDGET, params);
    expect(r.droitsInscription).toBe(200);
    expect(r.fraisMensuels).toBe(25.42); // (200 + 105) / 12
    expect(r.resteAVivre).toBe(-127.42);

    const seuil = PARAMS.map((p) => (p.cle === 'seuil_fragile' ? { ...p, valeur: 300 } : p));
    const r2 = calculerResteAVivre(francais, { ...BUDGET, job: 850 }, seuil);
    expect(r2.resteAVivre).toBe(124.42);
    expect(r2.niveau).toBe('fragile'); // 124,42 < 300
  });

  it('SIM-14 : boursier + international coché → boursier prioritaire, frais 0', () => {
    const r = calculerResteAVivre(
      { statut: 'intl', niveau: 'master', boursier: true, exonere: false },
      BUDGET,
      PARAMS,
    );
    expect(r.fraisMensuels).toBe(0);
    expect(r.resteAVivre).toBe(-102);
  });

  it('SIM-15 : le résultat indique quel tarif d’inscription a été appliqué', () => {
    const tarif = (profil) => calculerResteAVivre(profil, BUDGET, PARAMS).tarif;
    expect(tarif(francais)).toBe('national');
    expect(tarif({ statut: 'intl', niveau: 'licence' })).toBe('international');
    expect(tarif({ statut: 'intl', niveau: 'master', exonere: true })).toBe(
      'international_exonere',
    );
    expect(tarif({ ...francais, boursier: true })).toBe('boursier');
    // Boursier prioritaire, même international non exonéré (cf. SIM-14).
    expect(tarif({ statut: 'intl', niveau: 'master', boursier: true, exonere: false })).toBe(
      'boursier',
    );
    // « exonéré » n'a aucun effet pour un étudiant français : tarif national.
    expect(tarif({ ...francais, exonere: true })).toBe('national');
  });

  it('accepte la virgule française et les chaînes numériques', () => {
    const r = calculerResteAVivre(francais, { job: '600,50', loyer: ' 637 ' }, PARAMS);
    expect(r.totalRevenus).toBe(600.5);
    expect(r.totalDepenses).toBe(637);
  });

  it('évite les erreurs de virgule flottante (0,1 + 0,2)', () => {
    const r = calculerResteAVivre(
      { ...francais, boursier: true },
      { job: 0.1, famille: 0.2 },
      PARAMS,
    );
    expect(r.totalRevenus).toBe(0.3);
  });

  it('calcule la part du loyer dans les revenus', () => {
    const r = calculerResteAVivre(francais, BUDGET, PARAMS);
    expect(r.partLoyer).toBeCloseTo(637 / 850, 5);
    expect(calculerResteAVivre(francais, {}, PARAMS).partLoyer).toBeNull();
  });

  it('paramètre manquant → erreur explicite (jamais de montant deviné)', () => {
    const sansCvec = PARAMS.filter((p) => p.cle !== 'cvec');
    expect(() => calculerResteAVivre(francais, BUDGET, sansCvec)).toThrow(
      'Paramètre manquant : cvec',
    );
    const sansSeuil = PARAMS.filter((p) => p.cle !== 'seuil_fragile');
    expect(() => calculerResteAVivre(francais, BUDGET, sansSeuil)).toThrow('seuil_fragile');
    expect(() => calculerResteAVivre(francais, BUDGET, [])).toThrow('Paramètre manquant');
    expect(() => calculerResteAVivre(francais, BUDGET, undefined)).toThrow('Paramètre manquant');
  });

  it('profil invalide → erreur explicite', () => {
    expect(() =>
      calculerResteAVivre({ statut: 'martien', niveau: 'licence' }, BUDGET, PARAMS),
    ).toThrow('Statut inconnu');
    expect(() =>
      calculerResteAVivre({ statut: 'fr_ue', niveau: 'doctorat' }, BUDGET, PARAMS),
    ).toThrow('Niveau');
    expect(() => calculerResteAVivre(undefined, BUDGET, PARAMS)).toThrow();
  });

  it('ne modifie pas ses arguments', () => {
    const saisie = Object.freeze({ ...BUDGET });
    const params = Object.freeze(PARAMS.map((p) => Object.freeze({ ...p })));
    expect(() => calculerResteAVivre(Object.freeze({ ...francais }), saisie, params)).not.toThrow();
  });
});

describe('nombreSaisi', () => {
  it('convertit proprement', () => {
    expect(nombreSaisi(12)).toBe(12);
    expect(nombreSaisi('12.5')).toBe(12.5);
    expect(nombreSaisi('12,5')).toBe(12.5);
    expect(nombreSaisi('1 200')).toBe(1200);
    expect(nombreSaisi(-5)).toBe(0);
    expect(nombreSaisi('-5')).toBe(0);
    expect(nombreSaisi('')).toBe(0);
    expect(nombreSaisi('.')).toBe(0);
    expect(nombreSaisi(true)).toBe(0);
  });
});

describe('montants collés (relevé de banque, site, message)', () => {
  it.each([
    ['600', 600],
    ['600 €', 600],
    ['600€', 600],
    ['€600', 600],
    ['600 euros', 600],
    ['600 EUR', 600],
    ['1 250,50 €', 1250.5],
    ['1\u00a0250,50\u202f€', 1250.5],
    ['1250,5', 1250.5],
    ['1.250,50', 1250.5],
    ['1,250.50', 1250.5],
    ['1.250', 1250],
    ['1,250', 1250],
    ['1 250 300', 1250300],
    ['1.250.300', 1250300],
    ["1'250", 1250],
    ['12.5', 12.5],
    ['12,5', 12.5],
    ['0,250', 0.25],
    ['  450  ', 450],
  ])('« %s » vaut %s', (texte, attendu) => {
    expect(analyserMontant(texte)).toMatchObject({ valeur: attendu, reconnu: true });
    expect(nombreSaisi(texte)).toBe(attendu);
  });

  it.each(['abc', '12 abc', '-5', '−50', '1,2,3', '1.2.3', '12..5', '.', ',', 'un euro'])(
    '« %s » n’est pas un montant : 0 € et le signalement',
    (texte) => {
      expect(analyserMontant(texte)).toEqual({ valeur: 0, reconnu: false });
      expect(nombreSaisi(texte)).toBe(0);
    },
  );

  it.each([
    ['1.9', '1,9'],
    ['1,9', '1,9'],
    ['12.5', '12,5'],
    ['450.50', '450,50'],
    ['450,50', '450,50'],
    ['600 €', '600'],
    ['600 euros', '600'],
    ['1 250,50 €', '1250,50'],
    ['1.250,50', '1250,50'],
    ['1,250.50', '1250,50'],
    ['1,250', '1250'],
    ['0,250', '0,250'],
  ])('« %s » s’écrit « %s » (virgule, comme le bilan)', (texte, ecrit) => {
    expect(analyserMontant(texte).ecrit).toBe(ecrit);
  });

  it('un champ vide est reconnu et vaut 0', () => {
    expect(analyserMontant('')).toEqual({ valeur: 0, reconnu: true });
    expect(analyserMontant('   ')).toEqual({ valeur: 0, reconnu: true });
    expect(analyserMontant(undefined)).toEqual({ valeur: 0, reconnu: true });
  });
});

describe('trouverParametre', () => {
  it('prend le plus précis, sinon le plus général', () => {
    expect(
      trouverParametre(PARAMS, 'droits_inscription', { niveau: 'master', profil: 'intl' }),
    ).toBe(3950);
    expect(trouverParametre(PARAMS, 'droits_inscription', { niveau: 'master' })).toBe(254);
    expect(trouverParametre(PARAMS, 'cvec', { niveau: 'master', profil: 'intl' })).toBe(105);
  });
});
