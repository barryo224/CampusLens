import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { prismaTest, viderBase } from '../helpers/db.js';
import { seed } from '../../src/seed/index.js';
import { createApp } from '../../src/app.js';
import { verifierNouveauMotDePasse } from '../../src/routes/admin.js';

const EMAIL = 'ousmane.admin@campuslens.test';
const ANCIEN = 'ancien-mot-de-passe-solide';
const NOUVEAU = 'Un nouveau mot de passe très solide 2026';
const URL = '/api/admin/mot-de-passe';

describe('Admin : changer son mot de passe', () => {
  const prisma = prismaTest();
  let app;
  beforeAll(() => viderBase(prisma));
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    await viderBase(prisma);
    await seed(prisma);
    await prisma.administrateur.create({
      data: { email: EMAIL, motDePasseHash: bcrypt.hashSync(ANCIEN, 4), role: 'admin' },
    });
    app = createApp({ prisma }); // nouvelle app = compteurs de limitation remis à zéro
  });

  const connecter = async (mdp = ANCIEN, a = app) => {
    const agent = request.agent(a);
    await agent.post('/api/admin/login').send({ email: EMAIL, motDePasse: mdp }).expect(200);
    return agent;
  };
  const hash = async () =>
    (await prisma.administrateur.findUniqueOrThrow({ where: { email: EMAIL } })).motDePasseHash;

  it('exige une session', async () => {
    expect((await request(app).post(URL).send({ ancien: ANCIEN, nouveau: NOUVEAU })).status).toBe(
      401,
    );
  });

  it('change le mot de passe : le nouveau fonctionne, l’ancien ne fonctionne plus, le hash est bcrypt', async () => {
    const agent = await connecter();
    const avant = await hash();
    const res = await agent.post(URL).send({ ancien: ANCIEN, nouveau: NOUVEAU });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Mot de passe modifié.' });
    expect(JSON.stringify(res.body)).not.toContain(NOUVEAU);

    const apres = await hash();
    expect(apres).not.toBe(avant);
    expect(apres).toMatch(/^\$2[aby]\$12\$/); // bcrypt, coût 12
    expect(apres).not.toContain(NOUVEAU);
    expect(await bcrypt.compare(NOUVEAU, apres)).toBe(true);

    await request(app)
      .post('/api/admin/login')
      .send({ email: EMAIL, motDePasse: NOUVEAU })
      .expect(200);
    expect(
      (await request(app).post('/api/admin/login').send({ email: EMAIL, motDePasse: ANCIEN }))
        .status,
    ).toBe(401);
  });

  it('la session courante reste ouverte (avec un nouvel identifiant), toutes les AUTRES sont fermées', async () => {
    const ici = await connecter();
    const ailleurs = await connecter(); // un autre appareil, connecté avec l'ancien mot de passe
    const avantSid = ici.jar.getCookies({
      domain: '127.0.0.1',
      path: '/api/admin',
      secure: false,
      script: false,
    });
    expect((await ailleurs.get('/api/admin/me')).status).toBe(200);
    expect(await prisma.sessionAdmin.count()).toBe(2);

    await ici.post(URL).send({ ancien: ANCIEN, nouveau: NOUVEAU }).expect(200);

    expect((await ici.get('/api/admin/me')).status).toBe(200); // moi : toujours connecté
    expect((await ailleurs.get('/api/admin/me')).status).toBe(401); // l'autre appareil : déconnecté
    expect(await prisma.sessionAdmin.count()).toBe(1);
    expect(avantSid.length).toBeGreaterThan(0);
  });

  it('ne touche pas aux sessions d’un autre compte', async () => {
    await prisma.administrateur.create({
      data: {
        email: 'autre@campuslens.test',
        motDePasseHash: bcrypt.hashSync('autre-mot-de-passe-solide', 4),
        role: 'relecteur',
      },
    });
    const autre = request.agent(app);
    await autre
      .post('/api/admin/login')
      .send({ email: 'autre@campuslens.test', motDePasse: 'autre-mot-de-passe-solide' })
      .expect(200);
    const moi = await connecter();
    await moi.post(URL).send({ ancien: ANCIEN, nouveau: NOUVEAU }).expect(200);
    expect((await autre.get('/api/admin/me')).status).toBe(200);
  });

  it('mauvais mot de passe actuel → 401, rien n’est modifié', async () => {
    const agent = await connecter();
    const avant = await hash();
    const res = await agent.post(URL).send({ ancien: 'pas-le-bon-mot-de-passe', nouveau: NOUVEAU });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/mot de passe actuel est incorrect/);
    expect(await hash()).toBe(avant);
    expect((await agent.get('/api/admin/me')).status).toBe(200); // pas déconnecté pour autant
  });

  describe('règles du nouveau mot de passe → 400, rien n’est modifié', () => {
    const cas = [
      ['trop court', 'Court1!', /au moins 12 caractères/],
      ['11 caractères', '12345678abc', /au moins 12 caractères/],
      ['identique à l’ancien', ANCIEN, /différent de l’ancien/],
      ['contient l’adresse e-mail', 'xx-ousmane.admin-xx-2026', /adresse e-mail/],
      [
        'contient l’adresse e-mail (casse différente)',
        'XX-OUSMANE.ADMIN-xx-2026',
        /adresse e-mail/,
      ],
      ['répétitif', 'aaaaaaaaaaaaaaaaaaaa', /répétitif/],
    ];
    for (const [nom, nouveau, attendu] of cas) {
      it(nom, async () => {
        const agent = await connecter();
        const avant = await hash();
        const res = await agent.post(URL).send({ ancien: ANCIEN, nouveau });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(attendu);
        expect(await hash()).toBe(avant);
      });
    }
    it('trop long ou champ manquant ou champ en trop', async () => {
      const agent = await connecter();
      expect(
        (await agent.post(URL).send({ ancien: ANCIEN, nouveau: 'x'.repeat(201) })).status,
      ).toBe(400);
      expect((await agent.post(URL).send({ ancien: ANCIEN })).status).toBe(400);
      expect((await agent.post(URL).send({ nouveau: NOUVEAU })).status).toBe(400);
      expect(
        (await agent.post(URL).send({ ancien: ANCIEN, nouveau: NOUVEAU, role: 'admin' })).status,
      ).toBe(400);
      expect((await agent.post(URL).send({ ancien: 12345, nouveau: NOUVEAU })).status).toBe(400);
    });
  });

  it('5 mauvais mots de passe actuels → blocage temporaire (même avec le bon ensuite)', async () => {
    const agent = await connecter();
    for (let i = 0; i < 5; i++)
      expect(
        (await agent.post(URL).send({ ancien: `faux-${i}-mot-de-passe`, nouveau: NOUVEAU })).status,
      ).toBe(401);
    expect((await agent.post(URL).send({ ancien: ANCIEN, nouveau: NOUVEAU })).status).toBe(429);
    expect(await bcrypt.compare(ANCIEN, await hash())).toBe(true); // jamais modifié
  });

  it('un changement réussi ne compte pas dans la limite d’échecs', async () => {
    const agent = await connecter();
    let courant = ANCIEN;
    for (let i = 0; i < 7; i++) {
      const suivant = `Mot de passe numéro ${i} vraiment solide`;
      expect((await agent.post(URL).send({ ancien: courant, nouveau: suivant })).status).toBe(200);
      courant = suivant;
    }
  });

  describe('verifierNouveauMotDePasse (fonction pure)', () => {
    it('accepte un bon mot de passe, rejette les mauvais avec un message', () => {
      expect(verifierNouveauMotDePasse(NOUVEAU, ANCIEN, EMAIL)).toBeNull();
      expect(verifierNouveauMotDePasse('court', ANCIEN, EMAIL)).toMatch(/12 caractères/);
      expect(verifierNouveauMotDePasse(ANCIEN, ANCIEN, EMAIL)).toMatch(/différent/);
      // Une partie locale d'e-mail trop courte (moins de 4 caractères) n'est pas utilisée comme motif.
      expect(
        verifierNouveauMotDePasse('ab-mot-de-passe-long-2026', ANCIEN, 'ab@exemple.fr'),
      ).toBeNull();
    });
  });
});
