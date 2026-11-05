import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { creerContexte, nouvelleApp } from '../helpers/app.js';
import { ajouterMois } from '../../src/routes/contact.js';
import { chiffreurDepuisEnv } from '../../src/lib/chiffrement.js';

const valide = {
  objet: 'Une question',
  message: 'Bonjour, comment demander la bourse ?',
  email: 'etudiant@exemple.fr',
};

describe('API : formulaire de contact', () => {
  let prisma;
  let app;

  beforeAll(async () => {
    ({ prisma } = await creerContexte());
  });
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    await prisma.messageContact.deleteMany();
    app = nouvelleApp(prisma); // compteurs de limitation remis à zéro
  });

  it('API-07 : message valide → 201, supprimer_apres = aujourd’hui + 6 mois', async () => {
    const avant = new Date();
    const res = await request(app).post('/api/contact').send(valide);
    expect(res.status).toBe(201);

    const lignes = await prisma.messageContact.findMany();
    expect(lignes).toHaveLength(1);
    const attendu = ajouterMois(avant, 6).getTime();
    expect(Math.abs(lignes[0].supprimerApres.getTime() - attendu)).toBeLessThan(10_000);
    expect(lignes[0].email).toMatch(/^v1\./); // chiffré en base
    expect(chiffreurDepuisEnv().dechiffrer(lignes[0].email)).toBe(valide.email);
  });

  it('API-08 : e-mail invalide ou message vide → 400, rien n’est enregistré', async () => {
    const cas = [
      { ...valide, email: 'pas-un-email' },
      { ...valide, email: '' },
      { ...valide, message: '' },
      { ...valide, message: '   ' },
      { ...valide, objet: '' },
      { ...valide, message: 'x'.repeat(5001) },
      {},
    ];
    for (const corps of cas) {
      const res = await request(nouvelleApp(prisma)).post('/api/contact').send(corps);
      expect(res.status, JSON.stringify(corps).slice(0, 60)).toBe(400);
    }
    expect(await prisma.messageContact.count()).toBe(0);
  });

  it('JSON mal formé → 400 sans trace technique', async () => {
    const res = await request(app)
      .post('/api/contact')
      .set('Content-Type', 'application/json')
      .send('{pas du json');
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/SyntaxError|at /);
  });

  it('API-09 : le 6e message en 10 min depuis la même IP → 429', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/contact').send(valide);
      expect(res.status).toBe(201);
    }
    const sixieme = await request(app).post('/api/contact').send(valide);
    expect(sixieme.status).toBe(429);
    expect(await prisma.messageContact.count()).toBe(5);
  });

  it('anti-robot : le champ piège rempli → faux succès, rien d’enregistré', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send({ ...valide, siteWeb: 'http://spam.example' });
    expect(res.status).toBe(201);
    expect(await prisma.messageContact.count()).toBe(0);
  });

  it('ignore les champs inattendus (pas d’écriture arbitraire en base)', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send({ ...valide, supprimerApres: '2099-01-01', id: 999 });
    expect(res.status).toBe(201);
    const [ligne] = await prisma.messageContact.findMany();
    expect(ligne.id).not.toBe(999);
    expect(ligne.supprimerApres.getFullYear()).not.toBe(2099);
  });
});
