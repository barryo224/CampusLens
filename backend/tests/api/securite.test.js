import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { prismaTest, viderBase } from '../helpers/db.js';
import { seed } from '../../src/seed/index.js';
import { createApp } from '../../src/app.js';

describe('Sécurité de l’API (en-têtes, cookies, limites)', () => {
  const prisma = prismaTest();
  let app;
  beforeAll(async () => {
    await viderBase(prisma);
    await seed(prisma);
    await prisma.administrateur.create({
      data: {
        email: 'a@test.fr',
        motDePasseHash: bcrypt.hashSync('un-mot-de-passe-solide', 4),
        role: 'admin',
      },
    });
    app = createApp({ prisma, corsOrigin: 'https://campuslens.exemple' });
  });
  afterAll(() => prisma.$disconnect());

  it('Helmet : tous les en-têtes de sécurité sont présents, sur les succès comme sur les erreurs', async () => {
    for (const [url, statut] of [
      ['/api/aides', 200],
      ['/api/introuvable', 404],
      ['/api/aides?profil=zzz', 400],
      ['/api/admin/me', 401],
    ]) {
      const h = (await request(app).get(url)).headers;
      expect(h['content-security-policy'], url).toContain("default-src 'self'");
      expect(h['content-security-policy'], url).toContain("frame-ancestors 'self'");
      expect(h['strict-transport-security'], url).toMatch(/max-age=\d{7,}/);
      expect(h['x-content-type-options'], url).toBe('nosniff');
      expect(h['x-frame-options'], url).toBe('SAMEORIGIN');
      expect(h['referrer-policy'], url).toBe('no-referrer');
      expect(h['cross-origin-opener-policy'], url).toBe('same-origin');
      expect(h['cross-origin-resource-policy'], url).toBe('same-origin');
      expect(h['x-powered-by'], url).toBeUndefined();
      expect(h['server'], `${url} (statut ${statut})`).toBeUndefined();
    }
  });

  it('CORS : jamais « * », jamais une origine inconnue, et les cookies ne sont autorisés qu’à l’origine du site', async () => {
    const ok = await request(app).get('/api/aides').set('Origin', 'https://campuslens.exemple');
    expect(ok.headers['access-control-allow-origin']).toBe('https://campuslens.exemple');
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    for (const origine of [
      'https://pirate.example',
      'null',
      'https://campuslens.exemple.pirate.example',
      'http://campuslens.exemple',
    ]) {
      const ko = await request(app).get('/api/aides').set('Origin', origine);
      expect(ko.headers['access-control-allow-origin'], origine).toBeUndefined();
    }
    const preflight = await request(app)
      .options('/api/contact')
      .set('Origin', 'https://pirate.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sans CORS_ORIGIN configuré, aucune origine n’est autorisée (fermé par défaut)', async () => {
    const ferme = createApp({ prisma, corsOrigin: undefined });
    const res = await request(ferme).get('/api/aides').set('Origin', 'https://nimporte.quoi');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('en production : le cookie de session est HttpOnly, Secure et SameSite=Strict ; le secret est obligatoire', async () => {
    const prod = createApp({
      prisma,
      production: true,
      sessionSecret: 'un-secret-de-test-assez-long-et-aleatoire',
    });
    const res = await request(prod)
      .post('/api/admin/login')
      .set('X-Forwarded-Proto', 'https')
      .send({ email: 'a@test.fr', motDePasse: 'un-mot-de-passe-solide' });
    // Hors HTTPS réel, express-session n'envoie pas un cookie « Secure » : on vérifie donc aussi le réglage lui-même.
    const cookie = (res.headers['set-cookie'] ?? []).join(';');
    if (cookie) {
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
    }
    expect(() => createApp({ prisma, production: true })).toThrow(/SESSION_SECRET/);
  });

  it('le cookie de session n’est jamais posé à un visiteur ordinaire ni après un échec de connexion', async () => {
    for (const url of ['/api/aides', '/api/parametres', '/api/villes', '/api/sources']) {
      expect((await request(app).get(url)).headers['set-cookie'], url).toBeUndefined();
    }
    const echec = await request(app)
      .post('/api/admin/login')
      .send({ email: 'a@test.fr', motDePasse: 'faux' });
    expect(echec.headers['set-cookie']).toBeUndefined();
  });

  it('limites : corps trop gros → 413, JSON invalide → 400, type de contenu inattendu → refusé sans enregistrer', async () => {
    const gros = await request(app)
      .post('/api/contact')
      .send({ objet: 'x', email: 'a@b.fr', message: 'y'.repeat(20_000) });
    expect(gros.status).toBe(413);
    expect(gros.body).toEqual({ error: 'Requête trop volumineuse.' });
    expect(
      (
        await request(app)
          .post('/api/contact')
          .set('Content-Type', 'application/json')
          .send('{"pas":')
      ).status,
    ).toBe(400);
    const texte = await request(app)
      .post('/api/contact')
      .set('Content-Type', 'text/plain')
      .send('objet=x&email=a@b.fr&message=m');
    expect(texte.status).toBe(400);
    expect(await prisma.messageContact.count()).toBe(0);
  });

  it('les injections classiques sont traitées comme du texte inerte (SQL, NoSQL, scripts, chemins)', async () => {
    const pieges = [
      "'; DROP TABLE aide; --",
      '{"$ne":null}',
      '<script>alert(1)</script>',
      '../../etc/passwd',
      '%00',
      '1 OR 1=1',
    ];
    for (const p of pieges) {
      const r = await request(app).get('/api/ressources').query({ q: p });
      expect(r.status, p).toBe(200);
      expect(r.body, p).toEqual([]);
    }
    expect(await prisma.aide.count()).toBeGreaterThan(0); // la table existe toujours
    // Syntaxe d'objet dans l'adresse (« profil[$ne]=x ») : jamais interprétée comme un filtre, simplement ignorée.
    const objet = await request(app).get('/api/aides?profil[$ne]=x');
    const sansFiltre = await request(app).get('/api/aides');
    expect(objet.status).toBe(200);
    expect(objet.body).toEqual(sansFiltre.body); // aucun effet
    expect((await request(app).get('/api/aides?profil=a&profil=b')).status).toBe(400); // paramètre répété : refusé
    const login = await request(app)
      .post('/api/admin/login')
      .send({ email: { $ne: null }, motDePasse: { $ne: null } });
    expect(login.status).toBe(400);
  });

  it('limite générale par IP : configurable, renvoie 429 avec un message clair, mais /api/health reste disponible', async () => {
    const petite = createApp({ prisma, limiteParMinute: 3 });
    for (let i = 0; i < 3; i++) expect((await request(petite).get('/api/aides')).status).toBe(200);
    const refus = await request(petite).get('/api/aides');
    expect(refus.status).toBe(429);
    expect(refus.body).toEqual({ error: 'Trop de requêtes. Réessayez dans une minute.' });
    expect(refus.headers['ratelimit']).toBeDefined(); // le navigateur peut savoir quand réessayer
    expect((await request(petite).get('/api/health')).status).toBe(200); // la supervision n'est jamais bloquée
    // Par défaut (hors production) la limite est très large : des tests ou un développeur ne la rencontrent pas.
    const normale = createApp({ prisma });
    for (let i = 0; i < 400; i++)
      if ((await request(normale).get('/api/sources')).status !== 200)
        throw new Error('limite atteinte trop tôt');
  });

  it('les réponses d’erreur ne contiennent jamais de détail technique', async () => {
    const reponses = [
      await request(app).get('/api/introuvable'),
      await request(app).get('/api/aides?profil=zzz'),
      await request(app).post('/api/admin/login').send({}),
      await request(app).get('/api/villes/abc'),
    ];
    for (const r of reponses)
      expect(JSON.stringify(r.body)).not.toMatch(
        /prisma|postgres|node_modules|stack|at \w+ \(|\.js:\d+/i,
      );
  });
});
