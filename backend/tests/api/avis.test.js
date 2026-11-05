import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { prismaTest, viderBase } from '../helpers/db.js';
import { createApp } from '../../src/app.js';
import { chiffreurDepuisEnv } from '../../src/lib/chiffrement.js';

// Les commentaires sont chiffrés en base : on les relit avec la clé de développement, comme le fait l'administration.
const clair = (v) => chiffreurDepuisEnv().dechiffrer(v);
import { purgerAvis, maintenanceQuotidienne } from '../../src/sync/maintenance.js';

const MDP = 'un-mot-de-passe-solide-2026';

describe('Avis des visiteurs sur le site', () => {
  const prisma = prismaTest();
  let app;
  beforeAll(() => viderBase(prisma));
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    await viderBase(prisma);
    app = createApp({ prisma });
  });

  const envoyer = (corps, a = app) => request(a).post('/api/avis').send(corps);
  const connecte = async (role = 'admin') => {
    await prisma.administrateur.create({
      data: { email: `${role}@test.fr`, motDePasseHash: bcrypt.hashSync(MDP, 4), role },
    });
    const agent = request.agent(app);
    await agent
      .post('/api/admin/login')
      .send({ email: `${role}@test.fr`, motDePasse: MDP })
      .expect(200);
    return agent;
  };

  describe('envoi (public, anonyme)', () => {
    it('enregistre une note et un commentaire, sans aucune donnée d’identité', async () => {
      const res = await envoyer({
        note: 4,
        commentaire: '  Le simulateur m’a aidé à comprendre mes aides.  ',
        page: 'evaluer',
        profil: 'intl',
      });
      expect(res.status).toBe(201);
      const avis = await prisma.avis.findFirstOrThrow();
      // Le commentaire est chiffré en base : on le relit avec la clé.
      expect(avis.commentaire).toMatch(/^v1\./);
      expect(clair(avis.commentaire)).toBe('Le simulateur m’a aidé à comprendre mes aides.');
      expect(avis).toMatchObject({
        note: 4,
        page: 'evaluer',
        profil: 'intl',
        luLe: null,
      });
      // Aucune colonne d'identité : ni e-mail, ni nom, ni adresse IP.
      expect(Object.keys(avis).sort()).toEqual(
        ['commentaire', 'creeLe', 'id', 'luLe', 'note', 'page', 'profil', 'supprimerApres'].sort(),
      );
      // Suppression automatique programmée dans 12 mois.
      const mois = (avis.supprimerApres - avis.creeLe) / (30 * 24 * 3_600_000);
      expect(mois).toBeGreaterThan(11);
      expect(mois).toBeLessThan(13);
    });

    it('un avis « vide » est refusé : la note seule, des espaces ou un commentaire trop court ne passent pas', async () => {
      for (const corps of [
        { note: 5 },
        { note: 2, commentaire: '' },
        { note: 2, commentaire: '      ' },
        { note: 3, commentaire: 'ok' },
        { commentaire: 'Un texte sans aucune note' },
      ]) {
        const res = await envoyer(corps, createApp({ prisma }));
        expect(res.status, JSON.stringify(corps)).toBe(400);
      }
      expect(await prisma.avis.count()).toBe(0);
      // Message lisible (jamais « expected string, received undefined »).
      const sansTexte = await envoyer({ note: 4 }, createApp({ prisma }));
      expect(sansTexte.body.error).toMatch(/commentaire : racontez votre expérience/);
      const sansNote = await envoyer({ commentaire: 'Un texte' }, createApp({ prisma }));
      expect(sansNote.body.error).toMatch(/note : note de 1 à 5/);
      // Le minimum accepté : quelques mots (les espaces autour sont retirés).
      expect((await envoyer({ note: 4, commentaire: '  Utile ! ' })).status).toBe(201);
      expect(clair((await prisma.avis.findFirstOrThrow()).commentaire)).toBe('Utile !');
    });

    it('refuse une note absente ou hors de 1 à 5, un texte trop long, une page ou un profil inconnus', async () => {
      for (const corps of [
        {},
        { note: 0 },
        { note: 6 },
        { note: 3.5 },
        { note: '4' },
        { note: 4, commentaire: 'x'.repeat(1501) },
        { note: 4, page: 'admin' },
        { note: 4, profil: 'roi' },
      ]) {
        // Une application neuve à chaque essai : la limite de débit ne doit pas fausser ce test.
        const res = await envoyer(corps, createApp({ prisma }));
        expect(res.status, JSON.stringify(corps).slice(0, 40)).toBe(400);
      }
      expect(await prisma.avis.count()).toBe(0);
    });

    it('la contrainte de la base refuse aussi une note hors de 1 à 5 (même sans passer par l’API)', async () => {
      await expect(
        prisma.avis.create({ data: { note: 9, supprimerApres: new Date('2030-01-01') } }),
      ).rejects.toThrow();
    });

    it('le champ piège rempli par un robot : succès affiché, rien d’enregistré', async () => {
      const res = await envoyer({
        note: 1,
        commentaire: 'achetez',
        siteWeb: 'http://spam.example',
      });
      expect(res.status).toBe(201);
      expect(await prisma.avis.count()).toBe(0);
    });

    it('le texte est stocké tel quel (aucune interprétation) et ne casse pas la base', async () => {
      const piege = `<script>alert(1)</script>'; DROP TABLE avis; --`;
      expect((await envoyer({ note: 3, commentaire: piege })).status).toBe(201);
      expect(clair((await prisma.avis.findFirstOrThrow()).commentaire)).toBe(piege);
    });

    it('limite : 5 avis par 10 minutes, puis message clair (429)', async () => {
      const a = createApp({ prisma });
      const avis = { note: 3, commentaire: 'Plutôt clair, merci.' };
      for (let i = 0; i < 5; i++) expect((await envoyer(avis, a)).status).toBe(201);
      const trop = await envoyer(avis, a);
      expect(trop.status).toBe(429);
      expect(trop.body.error).toMatch(/Trop d’avis/);
      expect(await prisma.avis.count()).toBe(5);
    });
  });

  describe('administration', () => {
    const remplir = async () => {
      for (const [note, commentaire, page] of [
        [5, 'Très utile', 'evaluer'],
        [4, null, 'aides'],
        [2, 'Je n’ai pas compris le budget', 'budget'],
        [5, 'Merci', 'accueil'],
      ])
        await prisma.avis.create({
          data: { note, commentaire, page, supprimerApres: new Date('2030-01-01') },
        });
    };

    it('exige une session administrateur', async () => {
      const anonyme = request(app);
      expect((await anonyme.get('/api/admin/avis')).status).toBe(401);
      expect((await anonyme.post('/api/admin/avis/tout-lire')).status).toBe(401);
      expect((await anonyme.post('/api/admin/avis/1/lu')).status).toBe(401);
      expect((await anonyme.delete('/api/admin/avis/1')).status).toBe(401);
    });

    it('réservé au rôle « admin » : un relecteur n’y a pas accès', async () => {
      const relecteur = await connecte('relecteur');
      expect((await relecteur.get('/api/admin/avis')).status).toBe(403);
      expect((await relecteur.delete('/api/admin/avis/1')).status).toBe(403);
    });

    it('donne la moyenne, la répartition des notes et les avis les plus récents d’abord', async () => {
      const admin = await connecte();
      await remplir();
      const { stats, avis } = (await admin.get('/api/admin/avis')).body;
      expect(stats).toEqual({
        total: 4,
        nonLus: 4,
        moyenne: 4, // (5 + 4 + 2 + 5) / 4
        repartition: { 1: 0, 2: 1, 3: 0, 4: 1, 5: 2 },
      });
      expect(avis.map((a) => a.note)).toEqual([5, 2, 4, 5]); // du plus récent au plus ancien
    });

    it('sans aucun avis : pas de moyenne inventée', async () => {
      const admin = await connecte();
      const { stats } = (await admin.get('/api/admin/avis')).body;
      expect(stats).toMatchObject({ total: 0, moyenne: null });
    });

    it('pastille « non lus » : marquer un avis ou tous comme lus', async () => {
      const admin = await connecte();
      await remplir();
      expect((await admin.get('/api/admin/messages/non-lus')).body.avis).toBe(4);
      const premier = await prisma.avis.findFirstOrThrow({ orderBy: { id: 'asc' } });
      await admin.post(`/api/admin/avis/${premier.id}/lu`).expect(204);
      expect((await admin.get('/api/admin/messages/non-lus')).body.avis).toBe(3);
      expect((await admin.post('/api/admin/avis/tout-lire')).body).toEqual({ marques: 3 });
      expect((await admin.get('/api/admin/messages/non-lus')).body.avis).toBe(0);
      expect((await admin.post('/api/admin/avis/999999/lu')).status).toBe(404);
    });

    it('suppression d’un avis (droit à l’effacement) ; inconnu → 404', async () => {
      const admin = await connecte();
      await remplir();
      const avis = await prisma.avis.findFirstOrThrow();
      await admin.delete(`/api/admin/avis/${avis.id}`).expect(204);
      expect(await prisma.avis.count()).toBe(3);
      expect((await admin.delete(`/api/admin/avis/${avis.id}`)).status).toBe(404);
      expect((await admin.delete('/api/admin/avis/abc')).status).toBe(400);
    });
  });

  describe('suppression automatique (RGPD)', () => {
    it('les avis arrivés à leur date sont supprimés par la maintenance quotidienne, les autres restent', async () => {
      await prisma.avis.create({ data: { note: 3, supprimerApres: new Date('2026-06-01') } });
      await prisma.avis.create({ data: { note: 4, supprimerApres: new Date('2027-06-01') } });
      expect(await purgerAvis(prisma, new Date('2026-11-05'))).toBe(1);
      expect((await prisma.avis.findFirstOrThrow()).note).toBe(4);
      const r = await maintenanceQuotidienne(prisma, new Date('2028-01-01'));
      expect(r.avisSupprimes).toBe(1);
      expect(await prisma.avis.count()).toBe(0);
    });
  });
});
