import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { prismaTest, viderBase } from '../helpers/db.js';
import { createApp } from '../../src/app.js';
import { creerChiffreur, chiffreurDepuisEnv } from '../../src/lib/chiffrement.js';
import { chiffrerDonneesExistantes } from '../../src/admin/chiffrer-existant.js';

const MDP = 'un-mot-de-passe-solide-2026';
const CLE = 'une-cle-de-test-assez-longue-123456';

describe('Chiffrement des données personnelles', () => {
  describe('le chiffreur', () => {
    const c = creerChiffreur(CLE);

    it('chiffre puis déchiffre à l’identique (accents, émojis, longs textes)', () => {
      for (const t of ['bonjour', 'é à ç œ — « test »', '😀 emoji', 'x'.repeat(5000), '']) {
        expect(c.dechiffrer(c.chiffrer(t))).toBe(t);
      }
    });

    it('la valeur stockée ne contient jamais le texte, et deux chiffrements du même texte diffèrent', () => {
      const a = c.chiffrer('etudiant@exemple.fr');
      const b = c.chiffrer('etudiant@exemple.fr');
      expect(a).not.toContain('etudiant');
      expect(a).not.toContain('exemple');
      expect(a).not.toBe(b); // vecteur d'initialisation aléatoire : on ne peut pas repérer deux messages identiques
      expect(c.estChiffre(a)).toBe(true);
    });

    it('une valeur modifiée est REFUSÉE (authentification), de même qu’une autre clé', () => {
      const v = c.chiffrer('message secret');
      const altere = v.slice(0, -2) + (v.endsWith('AA') ? 'BB' : 'AA');
      expect(() => c.dechiffrer(altere)).toThrow();
      expect(() => creerChiffreur('une-autre-cle-tout-aussi-longue-99').dechiffrer(v)).toThrow();
      expect(() => c.dechiffrer('v1.abc')).toThrow();
    });

    it('une valeur ancienne, non chiffrée, reste lisible ; null reste null', () => {
      expect(c.dechiffrer('ancien texte clair')).toBe('ancien texte clair');
      expect(c.dechiffrer(null)).toBeNull();
      expect(c.chiffrer(null)).toBeNull();
    });

    it('une clé trop courte est refusée ; en production la clé est obligatoire', () => {
      expect(() => creerChiffreur('court')).toThrow(/16 caractères/);
      expect(() => chiffreurDepuisEnv({ production: true, cle: undefined })).toThrow(
        /obligatoire en production/,
      );
      expect(() =>
        createApp({
          prisma: {},
          production: true,
          sessionSecret: 'x'.repeat(40),
          chiffreur: undefined,
        }),
      ).toThrow();
    });
  });

  describe('dans la base', () => {
    const prisma = prismaTest();
    let app;
    let admin;
    beforeAll(() => viderBase(prisma));
    afterAll(() => prisma.$disconnect());
    beforeEach(async () => {
      await viderBase(prisma);
      await prisma.administrateur.create({
        data: { email: 'a@test.fr', motDePasseHash: bcrypt.hashSync(MDP, 4), role: 'admin' },
      });
      app = createApp({ prisma, chiffreur: creerChiffreur(CLE) });
      admin = request.agent(app);
      await admin
        .post('/api/admin/login')
        .send({ email: 'a@test.fr', motDePasse: MDP })
        .expect(200);
    });

    it('un message de contact est ILLISIBLE dans la base, mais l’administrateur le lit normalement', async () => {
      await request(app)
        .post('/api/contact')
        .send({
          objet: 'Question bourse',
          email: 'marie.dupont@exemple.fr',
          message: 'Mon numéro est le 06 12 34 56 78',
        })
        .expect(201);
      const brut = await prisma.messageContact.findFirstOrThrow();
      for (const champ of [brut.objet, brut.email, brut.message]) expect(champ).toMatch(/^v1\./);
      const copieBase = JSON.stringify(brut);
      for (const secret of ['marie', 'dupont', 'exemple', '06 12', 'bourse'])
        expect(copieBase).not.toContain(secret);

      const lu = (await admin.get('/api/admin/messages')).body[0];
      expect(lu).toMatchObject({
        objet: 'Question bourse',
        email: 'marie.dupont@exemple.fr',
        message: 'Mon numéro est le 06 12 34 56 78',
      });
    });

    it('le commentaire d’un avis est chiffré lui aussi, et lisible dans l’administration', async () => {
      await request(app)
        .post('/api/avis')
        .send({ note: 4, commentaire: 'Appelez-moi au 07 98 76 54 32' })
        .expect(201);
      expect((await prisma.avis.findFirstOrThrow()).commentaire).toMatch(/^v1\./);
      const { avis } = (await admin.get('/api/admin/avis')).body;
      expect(avis[0].commentaire).toBe('Appelez-moi au 07 98 76 54 32');
    });

    it('les messages anciens, en clair, restent lisibles ; la commande les chiffre sans jamais rechiffrer deux fois', async () => {
      await prisma.messageContact.create({
        data: {
          objet: 'Ancien',
          email: 'ancien@exemple.fr',
          message: 'texte clair',
          supprimerApres: new Date('2030-01-01'),
        },
      });
      await prisma.avis.create({
        data: { note: 3, commentaire: 'ancien avis', supprimerApres: new Date('2030-01-01') },
      });
      expect((await admin.get('/api/admin/messages')).body[0].email).toBe('ancien@exemple.fr'); // lisible avant

      const chiffreur = creerChiffreur(CLE);
      expect(await chiffrerDonneesExistantes(prisma, chiffreur)).toEqual({ messages: 1, avis: 1 });
      const apres = await prisma.messageContact.findFirstOrThrow();
      expect(apres.email).toMatch(/^v1\./);
      expect((await admin.get('/api/admin/messages')).body[0]).toMatchObject({
        email: 'ancien@exemple.fr',
        message: 'texte clair',
      });
      // Deuxième passage : rien à faire, et les valeurs chiffrées ne changent pas.
      expect(await chiffrerDonneesExistantes(prisma, chiffreur)).toEqual({ messages: 0, avis: 0 });
      expect((await prisma.messageContact.findFirstOrThrow()).email).toBe(apres.email);
    });
  });
});
