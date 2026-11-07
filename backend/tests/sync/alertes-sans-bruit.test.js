import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prismaTest, viderBase } from '../helpers/db.js';
import { seed } from '../../src/seed/index.js';
import { synchroniser } from '../../src/sync/moteur.js';
import { ROBOTS } from '../../src/sync/robots/index.js';
import { couper } from '../../src/sync/robots/veillePage.js';
import { fausseSource, pageHtml } from '../helpers/sources.js';

const PRINCIPAL = 'Les étudiants étrangers peuvent travailler 964 heures par an. '.repeat(12);
const pageCampusFrance = (recommandes) =>
  pageHtml(
    `<main><h1>Working while studying in France</h1><p>${PRINCIPAL}</p>` +
      `<h2>Related contents</h2><p>How to find work in France?</p>` +
      `<h2>Recommended items</h2><p>${recommandes}</p><h2>All items</h2><p>Follow the main steps</p></main>`,
  );

describe('couper : ignorer les blocs qui changent tout seuls', () => {
  it('coupe au premier bloc mouvant, ne touche à rien sinon', () => {
    const t = 'Texte principal\nSuite\nRecommended items\nArticle du jour';
    expect(couper(t, /^(Related contents|Recommended items)$/m)).toBe('Texte principal\nSuite');
    expect(couper('Texte sans bloc mouvant', /^Recommended items$/m)).toBe(
      'Texte sans bloc mouvant',
    );
    expect(couper(t, null)).toBe(t);
    // Un marqueur tout en haut ne vide jamais la page.
    expect(couper('Recommended items\nTout le reste', /^Recommended items$/m)).toBe(
      'Recommended items\nTout le reste',
    );
  });
});

describe('Alertes « à valider » sans bruit', () => {
  const prisma = prismaTest();
  beforeAll(() => viderBase(prisma));
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    await viderBase(prisma);
    await seed(prisma);
  });

  const robot = ROBOTS.veille_travail_etranger;
  const lire = (recommandes) =>
    fausseSource({ 'working-student': () => pageCampusFrance(recommandes) });
  const alertes = () =>
    prisma.changementDetecte.findMany({ where: { statut: 'a_valider' }, orderBy: { id: 'asc' } });

  it('Campus France : les « articles recommandés » qui tournent ne déclenchent plus de fausse alerte', async () => {
    await synchroniser(prisma, robot, {
      fetchImpl: lire('Industrial dynamism and French innovation'),
    });
    for (const autre of ['Job seeker residence permit', 'Study in Paris', 'Scholarships 2027']) {
      const r = await synchroniser(prisma, robot, { fetchImpl: lire(autre) });
      expect(r.statut, `bloc recommandé : ${autre}`).toBe('aucun_changement');
    }
    expect(await alertes()).toHaveLength(0);
  });

  it('…mais un vrai changement du texte principal est bien signalé', async () => {
    await synchroniser(prisma, robot, { fetchImpl: lire('Industrial dynamism') });
    const modifie = fausseSource({
      'working-student': () =>
        pageHtml(
          `<main><h1>Working while studying in France</h1><p>${PRINCIPAL.replace('964', '1000')}</p>` +
            `<h2>Recommended items</h2><p>Industrial dynamism</p></main>`,
        ),
    });
    const r = await synchroniser(prisma, robot, { fetchImpl: modifie });
    expect(r.statut).toBe('en_attente_validation');
    expect(await alertes()).toHaveLength(1);
  });

  it('une seule alerte en attente par source : une nouvelle version la met à jour au lieu d’en empiler', async () => {
    const version = (n) =>
      fausseSource({
        'working-student': () =>
          pageHtml(`<main><h1>Working</h1><p>${`Version ${n}. `.repeat(80)}</p></main>`),
      });
    await synchroniser(prisma, robot, { fetchImpl: version(1) }); // première lecture : référence
    const base = (
      await prisma.source.findUniqueOrThrow({ where: { cle: 'veille_travail_etranger' } })
    ).empreinte;

    const r2 = await synchroniser(prisma, robot, { fetchImpl: version(2) });
    expect(r2).toMatchObject({ statut: 'en_attente_validation', nbChangements: 1 });
    const r3 = await synchroniser(prisma, robot, { fetchImpl: version(3) });
    expect(r3).toMatchObject({ statut: 'en_attente_validation', nbChangements: 0 }); // même alerte, mise à jour
    const r4 = await synchroniser(prisma, robot, { fetchImpl: version(4) });
    expect(r4.nbChangements).toBe(0);

    const toutes = await alertes();
    expect(toutes).toHaveLength(1);
    expect(toutes[0].ancienneEmpreinte).toBe(base); // son « avant » reste la dernière version validée
    const source = await prisma.source.findUniqueOrThrow({
      where: { cle: 'veille_travail_etranger' },
    });
    expect(toutes[0].nouvelleEmpreinte).toBe(source.empreinte); // son « après » est la page la plus récente
  });

  it('une fois l’alerte traitée, un nouveau changement crée une nouvelle alerte', async () => {
    const version = (n) =>
      fausseSource({
        'working-student': () =>
          pageHtml(`<main><h1>Working</h1><p>${`Version ${n}. `.repeat(80)}</p></main>`),
      });
    await synchroniser(prisma, robot, { fetchImpl: version(1) });
    await synchroniser(prisma, robot, { fetchImpl: version(2) });
    await prisma.changementDetecte.updateMany({
      where: { statut: 'a_valider' },
      data: { statut: 'valide' },
    });
    const r = await synchroniser(prisma, robot, { fetchImpl: version(3) });
    expect(r).toMatchObject({ statut: 'en_attente_validation', nbChangements: 1 });
    expect(await alertes()).toHaveLength(1);
    expect(await prisma.changementDetecte.count()).toBe(2);
  });
});
