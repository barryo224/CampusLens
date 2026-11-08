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

  it('chaque paramètre a une source ; seuls les choix éditoriaux de CampusLens sont validés d’emblée', async () => {
    const params = await prisma.parametre.findMany({ include: { source: true } });
    for (const p of params) {
      expect(p.source).toBeTruthy();
      const editorial = p.source.organisme === 'CampusLens';
      expect(p.verifieLe === null, `${p.cle} (${p.source.organisme})`).toBe(!editorial);
    }
    const editoriaux = params
      .filter((p) => p.source.organisme === 'CampusLens')
      .map((p) => p.cle)
      .sort();
    expect(editoriaux).toEqual(['seuil_fragile', 'seuil_part_loyer', 'surface_studio_m2']);
  });

  it('les aides citent leur vraie source officielle quand elle a été consultée', async () => {
    const source = async (slug) =>
      (await prisma.aide.findUniqueOrThrow({ where: { slug }, include: { source: true } })).source;
    expect((await source('avance-loca-pass')).url).toBe(
      'https://www.actionlogement.fr/l-avance-loca-pass',
    );
    expect((await source('bourse-criteres-sociaux')).url).toContain(
      'service-public.fr/particuliers/vosdroits/F12214',
    );
    expect((await source('repas-crous-tarif-social')).url).toContain(
      'etudiant.gouv.fr/fr/restauration-universitaire',
    );
    const heures = await prisma.parametre.findFirstOrThrow({
      where: { cle: 'heures_travail_max' },
      include: { source: true },
    });
    expect(heures.source.organisme).toBe('Campus France');
  });

  it('contenu corrigé d’après les pages officielles : Loca-Pass réservée aux salariés/boursiers, repas à 1 €, bourse des internationaux', async () => {
    const loca = await prisma.aide.findUniqueOrThrow({
      where: { slug: 'avance-loca-pass' },
      include: { eligibilites: { include: { profil: true } } },
    });
    expect(loca.description).toContain('1 200 €');
    expect(loca.description).toMatch(/salariés ou boursiers d’État/);
    expect(loca.commentDemander).not.toMatch(/2 mois/); // affirmation non retrouvée sur la source : retirée
    const precision = (aide, code) => aide.eligibilites.find((e) => e.profil.code === code);
    expect(precision(loca, 'boursier')).toMatchObject({ statut: 'oui' });
    expect(precision(loca, 'fr_ue').precision).toMatch(/salarié ou boursier/i);
    const repas = await prisma.aide.findUniqueOrThrow({
      where: { slug: 'repas-crous-tarif-social' },
    });
    expect(repas.nom).toBe('Repas Crous à 1 €');
    expect(repas.description).toContain('1 €');
    const bourse = await prisma.aide.findUniqueOrThrow({
      where: { slug: 'bourse-criteres-sociaux' },
      include: { eligibilites: { include: { profil: true } } },
    });
    expect(bourse.eligibilites.find((e) => e.profil.code === 'intl').precision).toContain('2 ans');
  });

  it('le seed corrige une aide NON vérifiée, mais ne touche JAMAIS une aide déjà vérifiée par un humain', async () => {
    const loca = await prisma.aide.findUniqueOrThrow({ where: { slug: 'avance-loca-pass' } });
    const visale = await prisma.aide.findUniqueOrThrow({ where: { slug: 'garantie-visale' } });
    await prisma.aide.update({
      where: { id: loca.id },
      data: { description: 'Ancien texte erroné' },
    }); // non vérifiée
    await prisma.aide.update({
      where: { id: visale.id },
      data: { description: 'Texte validé par un humain', verifieLe: new Date() },
    });

    await seed(prisma);

    expect((await prisma.aide.findUniqueOrThrow({ where: { id: loca.id } })).description).toContain(
      '1 200 €',
    ); // corrigée
    const v = await prisma.aide.findUniqueOrThrow({ where: { id: visale.id } });
    expect(v.description).toBe('Texte validé par un humain'); // intacte
    expect(v.verifieLe).not.toBeNull();
  });

  it('les postes communs à tous totalisent 2 095 € ; la taxe de visa est réservée aux étudiants étrangers', async () => {
    const postes = await prisma.posteRentree.findMany();
    const communs = postes.filter((p) => !p.profilCode);
    expect(communs.reduce((s, p) => s + Number(p.montant), 0)).toBe(2095);
    const visa = postes.filter((p) => p.profilCode);
    expect(visa).toHaveLength(1);
    expect(visa[0]).toMatchObject({
      profilCode: 'intl',
      situation: 'arrivee',
      parametreCle: 'taxe_vls_ts',
    });
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

  it('crée toutes les villes suivies (Corse, Paris, Lyon, Marseille…) sans aucun loyer (les robots les remplissent)', async () => {
    const villes = await prisma.ville.findMany();
    expect(villes.length).toBeGreaterThanOrEqual(150);
    for (const nom of ['Paris', 'Lyon', 'Marseille', 'Ajaccio', 'Bastia', 'Corte', 'Rennes'])
      expect(villes.some((v) => v.nom === nom)).toBe(true);
    expect(new Set(villes.map((v) => v.codeInsee)).size).toBe(villes.length);
    expect(villes.every((v) => v.loyerM2Appartement === null && v.verifieLe === null)).toBe(true);
    expect(villes.find((v) => v.nom === 'Rennes').codeInsee).toBe('35238');
  });

  it('propose la ressource santé : la page officielle d’Ameli (Assurance Maladie) pour les étudiants', async () => {
    const sante = await prisma.ressource.findMany({ where: { categorie: 'sante' } });
    expect(sante).toHaveLength(1);
    expect(sante[0].organisme).toMatch(/ameli\.fr/);
    expect(sante[0].url).toBe(
      'https://www.ameli.fr/assure/droits-demarches/etudes-stages/etudiant',
    );
    expect(sante[0].type).toBe('Page d’information');
  });

  it('relie chaque robot à sa source (cle) avec une adresse officielle', async () => {
    const cles = (await prisma.source.findMany({ where: { cle: { not: null } } }))
      .map((s) => s.cle)
      .sort();
    // Robots de données + veilles des pages vérifiées à la main (aides, visa) + 25 réseaux de transport.
    expect(cles.filter((c) => !c.startsWith('veille_transport_'))).toEqual(
      [
        'cvec',
        'droits',
        'liens_ressources',
        'loyers',
        'logements_crous',
        'veille_apl',
        'veille_visale',
        'veille_aide_specifique',
        'veille_fsl',
        'veille_cout_inscription',
        'veille_bourse',
        'veille_loca_pass',
        'veille_repas_crous',
        'veille_visa',
        'veille_travail_etranger',
      ].sort(),
    );
    expect(cles.filter((c) => c.startsWith('veille_transport_'))).toHaveLength(25);
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

describe('Liens des données de départ', () => {
  it('aucune adresse connue pour être morte (domaine disparu ou certificat invalide)', async () => {
    const { readFileSync } = await import('node:fs');
    const texte = readFileSync(new URL('../src/seed/donnees.js', import.meta.url), 'utf8');
    // Vérifiés le 8 novembre 2026 : « agoraes.fr » n'existe plus (AGORAé est portée par la FAGE) et « lepilote.com » présente
    // un certificat invalide.
    expect(texte).not.toMatch(/agoraes\.fr|lepilote\.com/);
    expect(texte).toContain('https://fage.org/projet/agorae/');
  });
});
