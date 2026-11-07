import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Les textes de page sont coupés en lignes par le formateur : on compare avec des espaces simples.
const lire = (chemin) =>
  readFileSync(resolve(import.meta.dirname, '..', chemin), 'utf8').replace(/[ \t]*\n[ \t]*/g, ' ');

describe('Cohérence des textes du site avec son but (informer, préparer, bien vivre ses études)', () => {
  it('plus aucune promesse de « droit » dans les titres ni l’ancien message du pied de page', () => {
    expect(lire('src/pages/Aides.jsx')).not.toContain('auxquelles vous avez droit');
    expect(lire('src/components/Pied.jsx')).not.toContain('Comprendre ses droits');
    expect(lire('src/pages/Accueil.jsx')).not.toContain('Je découvre mes droits');
    expect(lire('src/pages/Accueil.jsx')).not.toContain('absolument');
    expect(lire('src/pages/APropos.jsx')).not.toMatch(
      /connaître ses droits|comprendre leurs droits/,
    );
  });
  it('les trois profils portent le même nom partout', () => {
    const profils = lire('src/lib/profils.js');
    expect(profils).toContain("'Étudiant français ou UE'");
    expect(profils).toContain("'Étudiant international hors UE'");
    expect(profils).not.toContain('européen');
    const budget = lire('src/pages/Budget.jsx');
    expect(budget).toContain("libelle: 'Étudiant boursier'");
    expect(budget).toContain("libelle: 'Étudiant international hors UE'");
  });
  it('« apprécié » (jargon) ne figure plus : la décision revient à la préfecture', () => {
    expect(lire('src/pages/Budget.jsx')).not.toContain('apprécié');
    expect(lire('src/pages/Budget.jsx')).toContain('la décision revient à la préfecture');
  });
  it('« À propos » ne prétend pas que des robots lisent les sites qui les refusent', () => {
    expect(lire('src/pages/APropos.jsx')).toContain('refuse les robots');
    expect(lire('src/pages/APropos.jsx')).toContain('à la main, au moins tous les 90');
  });
  it('aucune adresse e-mail personnelle publiée (pages, security.txt, configuration)', () => {
    const securite = readFileSync(
      resolve(import.meta.dirname, '..', 'public/.well-known/security.txt'),
      'utf8',
    );
    expect(securite).not.toMatch(/@gmail|mailto:/i);
    expect(securite).toMatch(/^Contact: https:\/\/campuslens-etudiants\.vercel\.app\/contact$/m);
    for (const f of [
      'src/pages/Contact.jsx',
      'src/pages/MentionsLegales.jsx',
      'src/pages/APropos.jsx',
    ])
      expect(lire(f)).not.toMatch(/mailto:|@gmail/);
  });
});
