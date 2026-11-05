import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { creerContexte, nouvelleApp } from '../helpers/app.js';

const EMAIL = 'admin@campuslens.test';
const MOT_DE_PASSE = 'un-mot-de-passe-solide-2026';

describe('API : espace admin', () => {
  let prisma;
  let app;

  beforeAll(async () => {
    ({ prisma } = await creerContexte());
    await prisma.administrateur.create({
      data: { email: EMAIL, motDePasseHash: bcrypt.hashSync(MOT_DE_PASSE, 4), role: 'admin' },
    });
  });
  afterAll(() => prisma.$disconnect());
  beforeEach(() => {
    app = nouvelleApp(prisma);
  });

  it('API-12 : /api/admin/* sans session → 401', async () => {
    for (const url of ['/api/admin/me', '/api/admin/changements', '/api/admin/nimporte-quoi']) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(401);
      expect(res.body.code, url).toBe('session_expiree');
    }
    expect((await request(app).post('/api/admin/logout')).status).toBe(401);
  });

  it('un mauvais mot de passe de connexion est un 401 SANS code de session (il ne doit pas ouvrir la fenêtre de reconnexion)', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ email: 'inconnu@test.fr', motDePasse: 'pas-le-bon-mot-de-passe' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBeUndefined();
  });

  it('connexion correcte → session ; /me et déconnexion fonctionnent', async () => {
    const agent = request.agent(app);
    const login = await agent
      .post('/api/admin/login')
      .send({ email: EMAIL, motDePasse: MOT_DE_PASSE });
    expect(login.status).toBe(200);
    expect(login.body).toEqual({ email: EMAIL, role: 'admin' });
    expect(JSON.stringify(login.body)).not.toMatch(/hash|\$2/);

    const cookie = login.headers['set-cookie'].join(';');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);

    expect((await agent.get('/api/admin/me')).status).toBe(200);
    expect((await agent.post('/api/admin/logout')).status).toBe(204);
    expect((await agent.get('/api/admin/me')).status).toBe(401);

    const admin = await prisma.administrateur.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(admin.derniereConnexion).not.toBeNull();
  });

  it('mauvais mot de passe ou e-mail inconnu → 401 avec le même message', async () => {
    const a = await request(app)
      .post('/api/admin/login')
      .send({ email: EMAIL, motDePasse: 'faux' });
    const b = await request(app)
      .post('/api/admin/login')
      .send({ email: 'inconnu@exemple.fr', motDePasse: 'faux' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
  });

  it('données de connexion invalides → 400', async () => {
    expect((await request(app).post('/api/admin/login').send({})).status).toBe(400);
  });

  it('API-13 : 5 mauvais mots de passe → blocage temporaire (même avec le bon ensuite)', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/api/admin/login')
        .send({ email: EMAIL, motDePasse: `faux${i}` });
      expect(res.status).toBe(401);
    }
    const bloque = await request(app)
      .post('/api/admin/login')
      .send({ email: EMAIL, motDePasse: MOT_DE_PASSE });
    expect(bloque.status).toBe(429);
  });
});
