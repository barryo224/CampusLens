import { describe, it, expect } from 'vitest';
import { suggererRessources } from '../src/lib/rechercheRessources.js';

const R = [
  {
    id: 1,
    titre: 'Demander une caution Visale',
    organisme: 'Action Logement',
    type: 'démarche',
    categorie: 'logement',
  },
  {
    id: 2,
    titre: 'Ameli : assurance maladie étudiante',
    organisme: 'Assurance Maladie',
    type: 'site',
    categorie: 'sante',
  },
  {
    id: 3,
    titre: 'Visa long séjour étudiant',
    organisme: 'France-Visas',
    type: 'démarche',
    categorie: 'administratif',
  },
  { id: 4, titre: 'Aide au logement', organisme: 'CAF', type: 'démarche', categorie: 'logement' },
];

describe('suggererRessources', () => {
  it('ne propose rien pour une saisie vide', () => {
    expect(suggererRessources(R, '  ')).toEqual([]);
  });
  it('classe d’abord le titre qui commence par la saisie, sans tenir compte des accents ni de la casse', () => {
    const t = suggererRessources(R, 'VISA').map((s) => s.ressource.id);
    expect(t[0]).toBe(3);
    expect(t).toContain(1);
  });
  it('trouve un mot au milieu du titre, puis l’organisme', () => {
    expect(suggererRessources(R, 'caution')[0].ressource.id).toBe(1);
    expect(suggererRessources(R, 'caf')[0].ressource.id).toBe(4);
  });
  it('exige tous les mots et indique l’organisme et la catégorie', () => {
    const s = suggererRessources(R, 'ameli maladie', (c) => (c === 'sante' ? 'Santé' : c));
    expect(s).toHaveLength(1);
    expect(s[0].detail).toBe('Assurance Maladie · Santé');
    expect(suggererRessources(R, 'ameli visale')).toEqual([]);
  });
  it('se limite à 6 propositions', () => {
    const beaucoup = Array.from({ length: 20 }, (_, i) => ({ ...R[0], id: i, titre: `Visa ${i}` }));
    expect(suggererRessources(beaucoup, 'visa')).toHaveLength(6);
  });
});
