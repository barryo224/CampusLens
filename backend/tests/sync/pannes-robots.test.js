import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { prismaTest, viderBase } from '../helpers/db.js';
import { seed } from '../../src/seed/index.js';
import { createApp } from '../../src/app.js';
import { passageDesRobots } from '../../src/sync/planificateur.js';
import { telecharger, TAILLE_MAX_TEXTE, ErreurSource } from '../../src/sync/http.js';
import { reponse } from '../helpers/sources.js';

const silencieux = { log() {}, error() {}, warn() {} };

describe('Des robots en panne ne gênent ni le site ni l’administration', () => {
  const prisma = prismaTest();
  beforeAll(() => viderBase(prisma));
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    await viderBase(prisma);
    await seed(prisma);
    await prisma.administrateur.create({
      data: {
        email: 'a@test.fr',
        motDePasseHash: bcrypt.hashSync('un-mot-de-passe-solide-2026', 4),
        role: 'admin',
      },
    });
  });

  const connecte = async (app) => {
    const agent = request.agent(app);
    await agent
      .post('/api/admin/login')
      .send({ email: 'a@test.fr', motDePasse: 'un-mot-de-passe-solide-2026' })
      .expect(200);
    return agent;
  };

  // Chaque famille de panne qu'une source peut provoquer.
  const PANNES = {
    'accès refusé (403)': async () => reponse({ status: 403 }),
    'erreur du serveur distant (500)': async () => reponse({ status: 500 }),
    'connexion coupée': async () => {
      throw new Error('fetch failed');
    },
    'page absurde (HTML à la place des données)': async () =>
      reponse({ texte: '<html>maintenance</html>' }),
    'réponse vide': async () => reponse({ texte: '' }),
  };

  for (const [nom, fetchImpl] of Object.entries(PANNES)) {
    it(`panne de TOUTES les sources : ${nom} → le passage se termine sans exception, le site et l’administration répondent`, async () => {
      const app = createApp({ prisma });
      const admin = await connecte(app);
      // Le passage des robots et des visiteurs/administrateurs en même temps.
      const [resultats, aides, ressources, sources, me] = await Promise.all([
        passageDesRobots(prisma, { fetchImpl, journal: silencieux }),
        request(app).get('/api/aides'),
        request(app).get('/api/ressources'),
        admin.get('/api/admin/sources'),
        admin.get('/api/admin/me'),
      ]);
      expect(resultats.length).toBeGreaterThan(5);
      for (const r of resultats)
        expect(['echec', 'aucun_changement', 'en_attente_validation', 'succes']).toContain(
          r.statut,
        );
      expect(aides.status).toBe(200);
      expect(ressources.status).toBe(200);
      expect(sources.status).toBe(200);
      expect(me.status).toBe(200);
      // Les données déjà enregistrées sont intactes : rien n'a été effacé ni abîmé par les échecs.
      expect(aides.body.length).toBeGreaterThan(5);
      expect(await prisma.aide.count()).toBeGreaterThan(5);
      // Après la panne, l'administration affiche toujours son état et le site toujours ses données.
      const apres = await admin.get('/api/admin/sources');
      expect(apres.status).toBe(200);
      expect(apres.body.length).toBeGreaterThan(30);
      expect((await request(app).get('/api/health?db=1')).status).toBe(200);
    });
  }

  it('un robot qui plante pour une raison imprévue n’empêche pas les suivants de passer', async () => {
    let appels = 0;
    const fetchImpl = async () => {
      appels += 1;
      if (appels === 1) throw new TypeError('bug imprévu dans un robot');
      return reponse({ status: 500 });
    };
    const resultats = await passageDesRobots(prisma, { fetchImpl, journal: silencieux });
    expect(resultats.length).toBeGreaterThan(3); // tous les autres robots ont tout de même été essayés
    expect(appels).toBeGreaterThan(3);
  });
});

describe('Taille des fichiers téléchargés par les robots', () => {
  it('une source qui annonce un fichier énorme est refusée avant tout téléchargement', async () => {
    let lu = false;
    const fetchImpl = async () => ({
      ...reponse({ texte: 'x' }),
      headers: {
        get: (n) => (n.toLowerCase() === 'content-length' ? String(TAILLE_MAX_TEXTE + 1) : null),
      },
      text: async () => {
        lu = true;
        return 'x';
      },
    });
    await expect(telecharger('https://exemple.fr/gros', { fetchImpl })).rejects.toThrow(
      /trop volumineux/,
    );
    expect(lu).toBe(false);
  });

  it('une source qui n’annonce pas sa taille mais dépasse la limite est coupée en cours de route', async () => {
    const morceau = new Uint8Array(1024 * 1024); // 1 Mo
    let lus = 0;
    const flux = {
      getReader: () => ({
        read: async () => {
          lus += 1;
          return lus > 50 ? { done: true } : { done: false, value: morceau };
        },
        cancel: async () => {},
      }),
    };
    const fetchImpl = async () => ({ ...reponse({}), body: flux });
    await expect(telecharger('https://exemple.fr/flux', { fetchImpl })).rejects.toThrow(
      ErreurSource,
    );
    expect(lus).toBeLessThan(15); // arrêté vers 8 Mo, pas après 50
  });

  it('un fichier de taille normale passe (texte et binaire)', async () => {
    const f = async () => reponse({ texte: 'bonjour', url: 'https://exemple.fr/ok' });
    expect((await telecharger('https://exemple.fr/ok', { fetchImpl: f })).texte).toBe('bonjour');
    const b = await telecharger('https://exemple.fr/ok', { fetchImpl: f, binaire: true });
    expect(b.octets).toBeInstanceOf(Uint8Array);
  });
});
