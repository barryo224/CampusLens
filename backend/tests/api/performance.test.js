import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import request from 'supertest';
import { gunzipSync } from 'node:zlib';
import { prismaTest, viderBase } from '../helpers/db.js';
import { seed } from '../../src/seed/index.js';
import { createApp } from '../../src/app.js';
import { CACHE_PUBLIC } from '../../src/routes/publiques.js';

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

  it('l’administration et l’estimation ne sont jamais mises en cache', async () => {
    expect((await lire('/api/admin/me')).headers['cache-control']).toBe('no-store'); // même non connecté (401)
    const estimation = await request(app).post('/api/simulation/aides-estimees').send({});
    expect(estimation.headers['cache-control']).toBe('no-store');
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
