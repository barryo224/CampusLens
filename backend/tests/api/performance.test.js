import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import request from 'supertest';
import { gunzipSync } from 'node:zlib';
import { prismaTest, viderBase } from '../helpers/db.js';
import { seed } from '../../src/seed/index.js';
import { createApp } from '../../src/app.js';
import { creerPrisma } from '../../src/db.js';
import { CACHE_PUBLIC, CACHE_CDN } from '../../src/routes/publiques.js';

// Performance et montée en charge : compression des réponses et consignes de cache.
describe('Performance : compression et cache', () => {
  const prisma = prismaTest();
  let app;
  beforeAll(async () => {
    await viderBase(prisma);
    await seed(prisma);
    app = createApp({ prisma });
  });
  afterAll(() => prisma.$disconnect());

  const lire = (chemin, entetes = {}) => request(app).get(chemin).set(entetes);

  it('les données publiques réussies sont mises en cache pour un service de diffusion, mais revérifiées par le navigateur', async () => {
    for (const chemin of [
      '/api/villes',
      '/api/aides',
      '/api/parametres',
      '/api/ressources',
      '/api/associations',
      '/api/postes-rentree?profil=fr_ue',
    ]) {
      const res = await lire(chemin);
      expect(res.status, chemin).toBe(200);
      expect(res.headers['cache-control'], chemin).toBe(CACHE_PUBLIC);
    }
    expect(CACHE_PUBLIC).toMatch(/max-age=0/); // le navigateur revérifie toujours : l'admin revoit ses changements aussitôt
    expect(CACHE_PUBLIC).toMatch(/must-revalidate/);
    expect(CACHE_PUBLIC).not.toMatch(/stale-while-revalidate/); // sinon un navigateur montrerait l'ancienne valeur
    expect(CACHE_PUBLIC).toMatch(/s-maxage=120/);
  });

  it('une erreur n’est JAMAIS mise en cache (400, 404, route inconnue)', async () => {
    expect((await lire('/api/aides/xyz')).headers['cache-control']).toBe('no-store');
    const invalide = await lire('/api/postes-rentree?niveau=doctorat');
    expect(invalide.status).toBe(400);
    expect(invalide.headers['cache-control']).toBe('no-store');
    const inconnue = await lire('/api/nexiste-pas');
    expect(inconnue.status).toBe(404);
    expect(inconnue.headers['cache-control']).toBe('no-store');
  });

  it('l’administration n’est jamais mise en cache', async () => {
    expect((await lire('/api/admin/me')).headers['cache-control']).toBe('no-store'); // même non connecté (401)
  });
  it('l’ancienne route d’estimation n’existe plus', async () => {
    expect((await request(app).post('/api/simulation/aides-estimees').send({})).status).toBe(404);
  });

  it('les réponses sont compressées (gzip) : la liste des villes pèse environ 10 fois moins sur le réseau', async () => {
    // Vraie connexion HTTP : on lit les octets tels qu'ils circulent, sans décompression automatique.
    const serveur = await new Promise((ok) => {
      const s = app.listen(0, () => ok(s));
    });
    const lireOctets = (encodage) =>
      new Promise((resolve, reject) => {
        http
          .get(
            {
              port: serveur.address().port,
              path: '/api/villes',
              headers: { 'Accept-Encoding': encodage },
            },
            (res) => {
              const morceaux = [];
              res.on('data', (m) => morceaux.push(m));
              res.on('end', () =>
                resolve({ entetes: res.headers, octets: Buffer.concat(morceaux) }),
              );
            },
          )
          .on('error', reject);
      });
    try {
      const brut = await lireOctets('identity');
      const gzip = await lireOctets('gzip');
      expect(brut.entetes['content-encoding']).toBeUndefined();
      expect(gzip.entetes['content-encoding']).toBe('gzip');
      expect(gzip.octets.length).toBeLessThan(brut.octets.length / 5);
      // Une fois décompressée, c'est exactement la même réponse.
      expect(JSON.parse(gunzipSync(gzip.octets).toString())).toEqual(
        JSON.parse(brut.octets.toString()),
      );
    } finally {
      await new Promise((ok) => serveur.close(ok));
    }
  });

  it('plusieurs dizaines de requêtes simultanées reçoivent toutes la bonne réponse', async () => {
    const reponses = await Promise.all(
      Array.from({ length: 60 }, (_, i) =>
        lire(['/api/villes', '/api/aides', '/api/parametres', '/api/ressources'][i % 4]),
      ),
    );
    expect(reponses.every((r) => r.status === 200)).toBe(true);
    expect(reponses.filter((r) => r.body.length > 100 || r.body.parametres).length).toBeGreaterThan(
      0,
    );
  });
});

describe('Hébergement gratuit : service de diffusion et base qui s’endort', () => {
  const prisma = prismaTest();
  afterAll(() => prisma.$disconnect());

  it('une consigne de cache réservée au service de diffusion permet de servir l’ancienne version pendant le réveil du serveur', async () => {
    const app = createApp({ prisma });
    const res = await request(app).get('/api/aides');
    expect(res.headers['cdn-cache-control']).toBe(CACHE_CDN);
    expect(CACHE_CDN).toMatch(/stale-while-revalidate/);
    // Le navigateur, lui, ne reçoit que la consigne « revérifier toujours » (jamais de donnée périmée).
    expect(res.headers['cache-control']).not.toMatch(/stale-while-revalidate/);
    // Aucune consigne CDN sur une erreur, l'estimation ni l'administration.
    expect(
      (await request(app).get('/api/nexiste-pas')).headers['cdn-cache-control'],
    ).toBeUndefined();
    expect((await request(app).get('/api/aides/xyz')).headers['cdn-cache-control']).toBeUndefined();
    expect((await request(app).get('/api/admin/me')).headers['cdn-cache-control']).toBeUndefined();
  });

  it('/api/health ne touche pas à la base (la surveillance ne la réveille pas) ; ?db=1 la vérifie', async () => {
    const compte = { requetes: 0 };
    const base = {
      $queryRaw: async () => {
        compte.requetes++;
        return [{ '?column?': 1 }];
      },
    };
    const app = createApp({ prisma: base });
    expect((await request(app).get('/api/health')).body).toEqual({ status: 'ok' });
    expect(compte.requetes).toBe(0);
    expect((await request(app).get('/api/health?db=1')).body).toEqual({ status: 'ok', base: 'ok' });
    expect(compte.requetes).toBe(1);

    const enPanne = createApp({
      prisma: {
        $queryRaw: async () => {
          throw new Error('connexion refusée');
        },
      },
    });
    const res = await request(enPanne).get('/api/health?db=1');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'erreur', base: 'injoignable' });
    expect(JSON.stringify(res.body)).not.toMatch(/connexion refusée/); // aucun détail technique
    expect((await request(enPanne).get('/api/health')).status).toBe(200); // le serveur lui-même répond
  });

  it('la base coupe les connexions inactives (comme Neon quand elle s’endort) : le serveur ne plante pas et se reconnecte seul', async () => {
    // Un client dédié, repéré par un nom d'application : on ne coupe QUE ses connexions (les autres tests tournent en parallèle).
    const nom = `test-coupure-${process.pid}-${Date.now()}`;
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.searchParams.set('application_name', nom);
    const client = creerPrisma(url.toString());
    const erreurs = [];
    const surErreur = (e) => erreurs.push(e);
    process.on('uncaughtException', surErreur);
    try {
      expect(await client.ville.count()).toBeGreaterThanOrEqual(0);
      const coupees = await prisma.$queryRawUnsafe(
        `select count(pg_terminate_backend(pid))::int as n from pg_stat_activity where application_name = '${nom}' and state = 'idle'`,
      );
      expect(coupees[0].n).toBeGreaterThanOrEqual(1); // la connexion de CE client a bien été coupée
      await new Promise((r) => setTimeout(r, 800));
      for (let i = 0; i < 5; i++) expect(await client.ville.count()).toBeGreaterThanOrEqual(0);
      expect(erreurs).toEqual([]); // aucun plantage
    } finally {
      process.off('uncaughtException', surErreur);
      await client.$disconnect();
    }
  });
});
