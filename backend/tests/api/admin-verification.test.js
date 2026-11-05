import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { prismaTest, viderBase } from '../helpers/db.js';
import { seed } from '../../src/seed/index.js';
import { createApp } from '../../src/app.js';

const MDP = 'un-mot-de-passe-solide-2026';

describe('Admin : données à vérifier à la main', () => {
  const prisma = prismaTest();
  let app;
  let admin;
  let relecteur;
  beforeAll(() => viderBase(prisma));
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    await viderBase(prisma);
    await seed(prisma);
    const hash = bcrypt.hashSync(MDP, 4);
    await prisma.administrateur.create({
      data: { email: 'a@test.fr', motDePasseHash: hash, role: 'admin' },
    });
    await prisma.administrateur.create({
      data: { email: 'r@test.fr', motDePasseHash: hash, role: 'relecteur' },
    });
    app = createApp({ prisma });
    admin = request.agent(app);
    relecteur = request.agent(app);
    await admin.post('/api/admin/login').send({ email: 'a@test.fr', motDePasse: MDP }).expect(200);
    await relecteur
      .post('/api/admin/login')
      .send({ email: 'r@test.fr', motDePasse: MDP })
      .expect(200);
  });

  const lister = async (agent = admin) => (await agent.get('/api/admin/verification')).body;
  const aide = (slug) =>
    prisma.aide.findUniqueOrThrow({ where: { slug }, include: { source: true } });

  it('exige une session', async () => {
    const anonyme = request(app);
    expect((await anonyme.get('/api/admin/verification')).status).toBe(401);
    expect((await anonyme.post('/api/admin/verification/aide/1')).status).toBe(401);
    expect((await anonyme.post('/api/admin/verification/source/1')).status).toBe(401);
  });

  it('liste les données non vérifiées gérées à la main, avec leur source et ce qu’il faut comparer', async () => {
    const items = await lister();
    const types = new Set(items.map((i) => i.type));
    expect([...types].sort()).toEqual(['aide', 'association', 'parametre', 'poste', 'transport']);
    const bourse = items.find(
      (i) => i.type === 'aide' && i.libelle.startsWith('Bourse sur critères sociaux'),
    );
    expect(bourse.detail).toContain('Dossier social étudiant'); // la démarche affichée au public
    expect(bourse.detail).toMatch(/boursier = oui/); // l'éligibilité par profil
    expect(bourse.source).toMatchObject({
      organisme: expect.any(String),
      url: expect.stringMatching(/^https?:/),
    });
    expect(bourse.verifieLe).toBeNull();
    const poste = items.find((i) => i.type === 'poste' && i.libelle === 'Dépôt de garantie');
    expect(poste.detail).toContain('637');
  });

  it('n’inclut JAMAIS ce que gèrent les robots (loyers, résidences, liens, droits et CVEC) ni les villes', async () => {
    const items = await lister();
    const params = items.filter((i) => i.type === 'parametre').map((i) => i.libelle);
    expect(params.some((l) => l.startsWith('droits_inscription'))).toBe(false); // validés depuis « À valider »
    expect(params.some((l) => l.startsWith('cvec'))).toBe(false);
    expect(items.some((i) => i.type === 'ville' || i.type === 'ressource')).toBe(false);
    for (const i of items)
      expect(['loyers', 'logements_crous', 'liens_ressources', 'droits', 'cvec']).not.toContain(
        i.source.cle ?? '',
      );
  });

  it('« J’ai vérifié » : la donnée disparaît de la liste, la mention disparaît du site public, c’est journalisé', async () => {
    const avant = await request(app).get('/api/aides?profil=fr_ue');
    expect(avant.body.every((a) => a.aVerifier)).toBe(true);
    const a = await aide('garantie-visale');

    const res = await admin.post(`/api/admin/verification/aide/${a.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ verifiee: 1 });

    expect((await lister()).some((i) => i.type === 'aide' && i.id === a.id)).toBe(false);
    const apres = (await request(app).get('/api/aides?profil=fr_ue')).body;
    expect(apres.find((x) => x.slug === 'garantie-visale').aVerifier).toBe(false);
    expect(apres.find((x) => x.slug === 'garantie-visale').verifieLe).not.toBeNull();
    expect(apres.find((x) => x.slug === 'bourse-criteres-sociaux').aVerifier).toBe(true); // les autres n'ont pas bougé
    const h = await prisma.historiqueValeur.findFirstOrThrow({
      where: { tableCible: 'aide', ligneId: String(a.id), champ: 'verifieLe' },
    });
    expect(h.ancienneValeur).toBeNull();
    expect(h.nouvelleValeur).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(h.synchronisationId).toBeNull(); // action manuelle
  });

  it('la source manuelle est marquée à jour ; au-delà de son délai, la mention revient (il faut revérifier)', async () => {
    const a = await aide('garantie-visale');
    await admin.post(`/api/admin/verification/aide/${a.id}`).expect(200);
    const source = await prisma.source.findUniqueOrThrow({ where: { id: a.sourceId } });
    expect(source.statut).toBe('ok');
    expect(source.dernierControle).not.toBeNull();

    // Le délai de vérification de la source est dépassé : la donnée repasse « à vérifier ».
    await prisma.source.update({
      where: { id: source.id },
      data: { dernierControle: new Date(Date.now() - (source.frequenceHeures + 24) * 3_600_000) },
    });
    expect(
      (await request(app).get('/api/aides?profil=fr_ue')).body.find(
        (x) => x.slug === 'garantie-visale',
      ).aVerifier,
    ).toBe(true);
    expect((await lister()).some((i) => i.type === 'aide' && i.id === a.id)).toBe(true);
  });

  it('« Tout vérifier pour cette source » : toutes les données de la source d’un coup', async () => {
    const poste = await prisma.posteRentree.findFirstOrThrow();
    const nbPostes = await prisma.posteRentree.count({ where: { sourceId: poste.sourceId } });
    const res = await admin.post(`/api/admin/verification/source/${poste.sourceId}`);
    expect(res.status).toBe(200);
    expect(res.body.verifiees).toBeGreaterThanOrEqual(nbPostes);
    const restant = (await lister()).filter((i) => i.source.id === poste.sourceId);
    expect(restant).toEqual([]);
    expect(
      (await prisma.posteRentree.findMany({ where: { sourceId: poste.sourceId } })).every(
        (p) => p.verifieLe,
      ),
    ).toBe(true);
  });

  it('le relecteur peut aussi vérifier (c’est un travail éditorial, pas de données personnelles)', async () => {
    const a = await aide('avance-loca-pass');
    expect((await relecteur.get('/api/admin/verification')).status).toBe(200);
    expect((await relecteur.post(`/api/admin/verification/aide/${a.id}`)).status).toBe(200);
  });

  it('refuse les données gérées par un robot, les types inconnus et les identifiants invalides', async () => {
    const droits = await prisma.parametre.findFirstOrThrow({
      where: { cle: 'droits_inscription', niveau: 'licence', profilId: null },
    });
    const refus = await admin.post(`/api/admin/verification/parametre/${droits.id}`);
    expect(refus.status).toBe(422);
    expect(refus.body.error).toMatch(/robot/);
    expect(
      (await prisma.parametre.findUniqueOrThrow({ where: { id: droits.id } })).verifieLe,
    ).toBeNull();

    const sourceRobot = await prisma.source.findUniqueOrThrow({ where: { cle: 'loyers' } });
    expect((await admin.post(`/api/admin/verification/source/${sourceRobot.id}`)).status).toBe(422);
    expect((await admin.post('/api/admin/verification/inconnu/1')).status).toBe(400);
    expect((await admin.post('/api/admin/verification/aide/abc')).status).toBe(400);
    expect((await admin.post('/api/admin/verification/aide/999999')).status).toBe(404);
    expect((await admin.post('/api/admin/verification/source/999999')).status).toBe(404);
  });

  it('la vérification est idempotente : revérifier ne casse rien et garde la trace de chaque passage', async () => {
    const a = await aide('garantie-visale');
    await admin.post(`/api/admin/verification/aide/${a.id}`).expect(200);
    await admin.post(`/api/admin/verification/aide/${a.id}`).expect(200);
    const traces = await prisma.historiqueValeur.count({
      where: { tableCible: 'aide', ligneId: String(a.id), champ: 'verifieLe' },
    });
    expect(traces).toBe(2);
  });
});
