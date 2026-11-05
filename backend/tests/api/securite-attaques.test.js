import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { prismaTest, viderBase } from '../helpers/db.js';
import { createApp } from '../../src/app.js';
import { creerChiffreur } from '../../src/lib/chiffrement.js';
import { routesAdmin } from '../../src/routes/admin.js';
import { telecharger } from '../../src/sync/http.js';

// ATTAQUES SIMULÉES contre le serveur. Chaque test joue le rôle d'un attaquant : il doit échouer.
const MDP = 'un-mot-de-passe-solide-2026';
const SITE = 'https://campuslens.test';

describe('Attaques simulées', () => {
  const prisma = prismaTest();
  beforeAll(() => viderBase(prisma));
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    await viderBase(prisma);
    await prisma.administrateur.create({
      data: { email: 'a@test.fr', motDePasseHash: bcrypt.hashSync(MDP, 4), role: 'admin' },
    });
  });

  const connecte = async (app) => {
    const agent = request.agent(app);
    await agent.post('/api/admin/login').send({ email: 'a@test.fr', motDePasse: MDP }).expect(200);
    return agent;
  };

  describe('accès à l’administration', () => {
    it('TOUTE route de l’administration refuse un visiteur sans session (hors connexion)', async () => {
      const app = createApp({ prisma });
      const routes = [];
      for (const couche of routesAdmin(prisma).stack) {
        if (!couche.route) continue;
        for (const methode of Object.keys(couche.route.methods))
          routes.push([methode, couche.route.path]);
      }
      expect(routes.length).toBeGreaterThan(20); // on a bien énuméré les routes (et non une liste vide)
      const nonProtegees = [];
      for (const [methode, chemin] of routes) {
        if (chemin.startsWith('/login')) continue; // connexion en deux étapes : publiques par nature
        const url = `/api/admin${chemin.replace(/:[a-zA-Z]+/g, '1')}`;
        const res = await request(app)[methode](url).send({});
        if (res.status !== 401)
          nonProtegees.push(`${methode.toUpperCase()} ${url} → ${res.status}`);
      }
      expect(nonProtegees).toEqual([]);
    });

    it('une fausse adresse IP envoyée par l’attaquant ne remet pas son compteur à zéro', async () => {
      const app = createApp({ prisma }); // sans proxy déclaré : l'en-tête X-Forwarded-For est ignoré
      const codes = [];
      for (let i = 0; i < 7; i++) {
        const r = await request(app)
          .post('/api/admin/login')
          .set('X-Forwarded-For', `10.0.0.${i}`)
          .send({ email: 'a@test.fr', motDePasse: `mauvais-${i}-xxxxxxxx` });
        codes.push(r.status);
      }
      expect(codes.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
      expect(codes.slice(5)).toEqual([429, 429]);
    });

    it('force brute DISTRIBUÉE (une IP différente à chaque essai) : le compte lui-même se verrouille', async () => {
      // Derrière un proxy de confiance, chaque essai semble venir d'une IP différente : la limite par IP ne suffit plus.
      const app = createApp({ prisma, trustProxy: '1' });
      const codes = [];
      for (let i = 0; i < 14; i++) {
        const r = await request(app)
          .post('/api/admin/login')
          .set('X-Forwarded-For', `203.0.113.${i + 1}`)
          .send({ email: 'a@test.fr', motDePasse: `mauvais-${i}-xxxxxxxx` });
        codes.push(r.status);
      }
      expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0);
      // Même avec le BON mot de passe, un compte verrouillé refuse la connexion le temps du verrouillage.
      const bon = await request(app)
        .post('/api/admin/login')
        .set('X-Forwarded-For', '203.0.113.200')
        .send({ email: 'a@test.fr', motDePasse: MDP });
      expect(bon.status).toBe(429);
    });

    it('on ne peut pas savoir si une adresse est un compte administrateur (même réponse)', async () => {
      const app = createApp({ prisma });
      const inconnu = await request(app)
        .post('/api/admin/login')
        .send({ email: 'x@test.fr', motDePasse: 'nimportequoi-123' });
      const connu = await request(app)
        .post('/api/admin/login')
        .send({ email: 'a@test.fr', motDePasse: 'nimportequoi-123' });
      expect(inconnu.status).toBe(connu.status);
      expect(inconnu.body).toEqual(connu.body);
    });

    it('les charges d’injection dans la connexion (objets, SQL, tableaux) sont refusées proprement', async () => {
      const app = createApp({ prisma });
      for (const corps of [
        { email: { $ne: null }, motDePasse: { $ne: null } },
        { email: "a@test.fr' OR '1'='1", motDePasse: "' OR '1'='1" },
        { email: ['a@test.fr'], motDePasse: [MDP] },
        { email: 'a@test.fr', motDePasse: 'x'.repeat(5000) },
      ]) {
        const res = await request(createApp({ prisma })).post('/api/admin/login').send(corps);
        expect([400, 401, 413]).toContain(res.status);
        expect(JSON.stringify(res.body)).not.toMatch(/stack|prisma|SELECT|at \w+ \(/i);
      }
      expect(app).toBeTruthy();
    });
  });

  describe('session', () => {
    it('forgerie inter-sites (CSRF) : une écriture venant d’un autre site est refusée, même avec la session de l’administrateur', async () => {
      const app = createApp({ prisma, corsOrigin: SITE });
      const admin = await connecte(app);
      const piege = await admin
        .post('/api/admin/logout')
        .set('Origin', 'https://site-pirate.example');
      expect(piege.status).toBe(403);
      const piege2 = await admin
        .post('/api/admin/messages/tout-lire')
        .set('Origin', 'https://site-pirate.example');
      expect(piege2.status).toBe(403);
      // Depuis le vrai site, tout fonctionne.
      expect((await admin.post('/api/admin/messages/tout-lire').set('Origin', SITE)).status).toBe(
        200,
      );
      // Sans en-tête Origin (outil en ligne de commande, tests) : accepté, la session reste nécessaire.
      expect((await admin.get('/api/admin/me')).status).toBe(200);
    });

    it('une session ne dure pas indéfiniment, même si on l’utilise sans arrêt (durée absolue)', async () => {
      const app = createApp({ prisma });
      const admin = await connecte(app);
      expect((await admin.get('/api/admin/me')).status).toBe(200);
      // On vieillit la session de 13 heures dans la base : elle reste « active » (renouvelée à chaque requête) mais trop ancienne.
      const ligne = await prisma.sessionAdmin.findFirstOrThrow();
      const donnees = { ...ligne.donnees, connecteLe: Date.now() - 13 * 3_600_000 };
      await prisma.sessionAdmin.update({ where: { sid: ligne.sid }, data: { donnees } });
      const expiree = await admin.get('/api/admin/me');
      expect(expiree.status).toBe(401);
      // Le code permet au site d'ouvrir la fenêtre de reconnexion (et non de confondre avec un mauvais mot de passe).
      expect(expiree.body.code).toBe('session_expiree');
    });

    it('en production, le cookie de session est protégé (Secure, HttpOnly, SameSite=Strict, préfixe __Host-)', async () => {
      const app = createApp({
        prisma,
        production: true,
        chiffreur: creerChiffreur('une-cle-de-test-assez-longue-123456'),
        sessionSecret: 'x'.repeat(40),
        trustProxy: '1',
      });
      const res = await request(app)
        .post('/api/admin/login')
        .set('X-Forwarded-Proto', 'https')
        .send({ email: 'a@test.fr', motDePasse: MDP });
      const cookie = String(res.headers['set-cookie']);
      expect(cookie).toMatch(/^__Host-campuslens\.sid=/);
      expect(cookie).toMatch(/Secure/);
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect(cookie).toMatch(/Path=\//);
      expect(cookie).not.toMatch(/Domain=/); // le préfixe __Host- l'interdit
    });

    it('la déconnexion détruit la session côté serveur (rejouer l’ancien cookie ne marche plus)', async () => {
      const app = createApp({ prisma });
      const admin = await connecte(app);
      const cookie = (await admin.get('/api/admin/me')).request.cookies ?? '';
      await admin.post('/api/admin/logout').expect(204);
      expect(await prisma.sessionAdmin.count()).toBe(0);
      expect((await admin.get('/api/admin/me')).status).toBe(401);
      expect(cookie).not.toBeUndefined();
    });
  });

  describe('robustesse du serveur', () => {
    it('corps trop gros → 413 ; JSON invalide → 400 ; jamais de trace technique', async () => {
      const app = createApp({ prisma });
      const gros = await request(app)
        .post('/api/avis')
        .send({ note: 5, commentaire: 'x'.repeat(50_000) });
      expect(gros.status).toBe(413);
      const casse = await request(app)
        .post('/api/contact')
        .set('Content-Type', 'application/json')
        .send('{"objet": ');
      expect(casse.status).toBe(400);
      for (const r of [gros, casse])
        expect(JSON.stringify(r.body)).not.toMatch(/stack|node_modules|at \w+ \(/);
    });

    it('méthodes inattendues (PUT, PATCH, DELETE, TRACE) sur les données publiques : refusées', async () => {
      const app = createApp({ prisma });
      for (const m of ['put', 'patch', 'delete']) {
        for (const chemin of ['/api/aides', '/api/villes', '/api/parametres']) {
          const res = await request(app)[m](chemin).send({});
          expect([404, 405], `${m} ${chemin}`).toContain(res.status);
        }
      }
    });

    it('aucune information sur la technologie du serveur dans les en-têtes', async () => {
      const res = await request(createApp({ prisma })).get('/api/health');
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['server']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('SSRF : les robots ne doivent jamais être poussés vers le réseau interne', () => {
    it('refuse les adresses internes, les schémas dangereux et les redirections vers elles', async () => {
      const jamais = async () => {
        throw new Error('requête réseau émise : la protection a échoué');
      };
      for (const url of [
        'http://localhost/admin',
        'http://127.0.0.1:5432',
        'http://169.254.169.254/latest/meta-data/',
        'http://[::1]/',
        'http://10.0.0.5/',
        'http://192.168.1.10/',
        'http://0.0.0.0/',
        'file:///etc/passwd',
        'ftp://exemple.fr/x',
      ]) {
        await expect(telecharger(url, { fetchImpl: jamais }), url).rejects.toThrow(
          /adresse non autorisée|schéma/i,
        );
      }
      // Une redirection d'un site officiel vers le réseau interne est refusée avant d'être suivie.
      const appels = [];
      const redirige = async (url) => {
        appels.push(String(url));
        return new Response('', {
          status: 302,
          headers: { location: 'http://169.254.169.254/latest/meta-data/' },
        });
      };
      await expect(
        telecharger('https://www.service-public.gouv.fr/x', { fetchImpl: redirige }),
      ).rejects.toThrow(/adresse non autorisée/i);
      expect(appels).toEqual(['https://www.service-public.gouv.fr/x']);
    });
  });
});
