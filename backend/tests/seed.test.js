import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prismaTest, viderBase } from './helpers/db.js';
import { seed } from '../src/seed/index.js';

describe('Base de données et seed', () => {
  const prisma = prismaTest();

  beforeAll(async () => {
    await viderBase(prisma);
    await seed(prisma);
  });
  afterAll(() => prisma.$disconnect());

  it('crée les 3 profils', async () => {
    const codes = (await prisma.profil.findMany()).map((p) => p.code).sort();
    expect(codes).toEqual(['boursier', 'fr_ue', 'intl']);
  });

  it('crée une seule année « en cours » : 2026-2027', async () => {
    const enCours = await prisma.anneeUniversitaire.findMany({ where: { enCours: true } });
    expect(enCours).toHaveLength(1);
    expect(enCours[0].libelle).toBe('2026-2027');
  });

  it('crée les paramètres de calcul de l’année en cours', async () => {
    const get = async (cle, niveau, profilCode) => {
      const p = await prisma.parametre.findFirst({
        where: {
          cle,
          niveau,
          profil: profilCode ? { code: profilCode } : null,
          annee: { enCours: true },
        },
      });
      return Number(p.valeur);
    };
    expect(await get('droits_inscription', 'licence', null)).toBe(178);
    expect(await get('droits_inscription', 'master', null)).toBe(255);
    expect(await get('droits_inscription', 'licence', 'intl')).toBe(2902);
    expect(await get('droits_inscription', 'master', 'intl')).toBe(3950);
    expect(await get('cvec', 'aucun', null)).toBe(105);
    expect(await get('seuil_fragile', 'aucun', null)).toBe(150);
    expect(await get('heures_travail_max', 'aucun', 'intl')).toBe(964);
    expect(await get('seuil_part_loyer', 'aucun', null)).toBe(40);
    expect(await get('surface_studio_m2', 'aucun', null)).toBe(20);
  });

  it('chaque aide a une éligibilité pour chacun des 3 profils', async () => {
    const aides = await prisma.aide.findMany({ include: { eligibilites: true } });
    expect(aides.length).toBeGreaterThanOrEqual(8);
    for (const a of aides) expect(a.eligibilites).toHaveLength(3);
  });

  it('chaque donnée est rattachée à une source, sans date de vérification (« à vérifier »)', async () => {
    const params = await prisma.parametre.findMany({ include: { source: true } });
    for (const p of params) {
      expect(p.source).toBeTruthy();
      expect(p.verifieLe).toBeNull();
    }
  });

  it('les postes de rentrée totalisent 2 095 €', async () => {
    const postes = await prisma.posteRentree.findMany();
    const total = postes.reduce((s, p) => s + Number(p.montant), 0);
    expect(total).toBe(2095);
  });

  it('est idempotent et n’écrase jamais une valeur mise à jour', async () => {
    const cvec = await prisma.parametre.findFirstOrThrow({ where: { cle: 'cvec' } });
    await prisma.parametre.update({ where: { id: cvec.id }, data: { valeur: 111 } });
    const avant = await prisma.parametre.count();

    await seed(prisma); // 2e passage

    expect(await prisma.parametre.count()).toBe(avant);
    const apres = await prisma.parametre.findUniqueOrThrow({ where: { id: cvec.id } });
    expect(Number(apres.valeur)).toBe(111);
  });

  it('crée les 30 villes étudiantes sans aucun loyer (les robots les remplissent)', async () => {
    const villes = await prisma.ville.findMany();
    expect(villes).toHaveLength(30);
    expect(villes.every((v) => v.loyerM2Appartement === null && v.verifieLe === null)).toBe(true);
    expect(villes.find((v) => v.nom === 'Rennes').codeInsee).toBe('35238');
  });

  it('relie chaque robot à sa source (cle) avec une adresse officielle', async () => {
    const cles = (await prisma.source.findMany({ where: { cle: { not: null } } }))
      .map((s) => s.cle)
      .sort();
    expect(cles).toEqual(
      ['cvec', 'droits', 'liens_ressources', 'loyers', 'logements_crous'].sort(),
    );
    const droits = await prisma.source.findUniqueOrThrow({ where: { cle: 'droits' } });
    expect(droits.url).toContain('service-public.fr');
  });

  it('interdit deux paramètres identiques (index unique)', async () => {
    const annee = await prisma.anneeUniversitaire.findFirstOrThrow({ where: { enCours: true } });
    const source = await prisma.source.findFirstOrThrow();
    await expect(
      prisma.parametre.create({
        data: {
          cle: 'cvec',
          niveau: 'aucun',
          anneeId: annee.id,
          valeur: 1,
          unite: '€',
          sourceId: source.id,
        },
      }),
    ).rejects.toThrow();
  });

  it('interdit deux années « en cours »', async () => {
    await expect(
      prisma.anneeUniversitaire.create({
        data: {
          libelle: '2027-2028',
          dateDebut: new Date('2027-09-01'),
          dateFin: new Date('2028-08-31'),
          enCours: true,
        },
      }),
    ).rejects.toThrow();
  });
});
