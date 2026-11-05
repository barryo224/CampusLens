import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prismaTest, viderBase } from '../helpers/db.js';
import { seed } from '../../src/seed/index.js';
import { synchroniser } from '../../src/sync/moteur.js';
import { robotOpenfisca } from '../../src/sync/robots/openfisca.js';
import {
  fausseSource,
  reponse,
  variableAideLogement,
  ENTETES_OPENFISCA,
} from '../helpers/sources.js';

describe('robot de surveillance du moteur OpenFisca (niveau 2)', () => {
  const prisma = prismaTest();
  beforeAll(() => viderBase(prisma));
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    await viderBase(prisma);
    await seed(prisma);
  });
  const source = () => prisma.source.findUniqueOrThrow({ where: { cle: 'openfisca' } });
  const lancer = (reponseFn) =>
    synchroniser(prisma, robotOpenfisca, {
      fetchImpl: fausseSource({ '/variable/aide_logement': reponseFn }),
    });

  it('première lecture : note la version du moteur dans l’historique', async () => {
    const r = await lancer(() => variableAideLogement('175.0.45'));
    expect(r.statut).toBe('succes');
    const h = await prisma.historiqueValeur.findFirstOrThrow({
      where: { tableCible: 'source', champ: 'version_moteur' },
    });
    expect([h.ancienneValeur, h.nouvelleValeur]).toEqual([null, 'openfisca-france 175.0.45']);
    expect((await source()).statut).toBe('ok');
    expect((await source()).dernierControle).not.toBeNull();
  });

  it('version inchangée : aucun changement, seule la date de contrôle bouge', async () => {
    await lancer(() => variableAideLogement('175.0.45'));
    const r = await lancer(() => variableAideLogement('175.0.45'));
    expect(r.statut).toBe('aucun_changement');
    expect(await prisma.historiqueValeur.count({ where: { tableCible: 'source' } })).toBe(1);
  });

  it('nouvelle version du moteur : l’historique garde l’ancienne et la nouvelle, dernier_changement est mis à jour', async () => {
    await lancer(() => variableAideLogement('175.0.45'));
    const avant = await source();
    await new Promise((r) => setTimeout(r, 15));
    const r = await lancer(() => variableAideLogement('176.1.0'));
    expect(r.statut).toBe('succes');
    const h = await prisma.historiqueValeur.findFirstOrThrow({
      where: { tableCible: 'source', champ: 'version_moteur' },
      orderBy: { id: 'desc' },
    });
    expect([h.ancienneValeur, h.nouvelleValeur]).toEqual([
      'openfisca-france 175.0.45',
      'openfisca-france 176.1.0',
    ]);
    expect((await source()).dernierChangement.getTime()).toBeGreaterThan(
      avant.dernierChangement.getTime(),
    );
  });

  it('le moteur a changé de forme (variable disparue, autre entité, autre type) → échec explicite, source en « erreur »', async () => {
    const cas = [
      () => reponse({ status: 404 }),
      () =>
        variableAideLogement('175.0.45', {
          id: 'aide_logement',
          entity: 'individu',
          valueType: 'Float',
        }),
      () =>
        variableAideLogement('175.0.45', {
          id: 'aide_logement',
          entity: 'famille',
          valueType: 'String',
        }),
      () => variableAideLogement('175.0.45', { autre: 'chose' }),
      () => reponse({ texte: 'pas du json', entetes: ENTETES_OPENFISCA }),
      () =>
        reponse({
          texte: '{}',
          entetes: {
            'country-package': 'openfisca-autre-pays',
            'country-package-version': '1.0.0',
          },
        }),
      () => reponse({ texte: '{"id":"aide_logement","entity":"famille","valueType":"Float"}' }), // en-têtes absents
    ];
    for (const c of cas) {
      const r = await lancer(c);
      expect(r.statut).toBe('echec');
      expect((await source()).statut).toBe('erreur');
    }
    expect(await prisma.historiqueValeur.count({ where: { tableCible: 'source' } })).toBe(0); // rien d'enregistré
  });
});
