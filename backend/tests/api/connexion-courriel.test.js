import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { prismaTest, viderBase } from '../helpers/db.js';
import { createApp } from '../../src/app.js';
import {
  codeCorrect,
  creerEnvoyeurCode,
  genererCode,
  masquerAdresse,
  preparerCode,
} from '../../src/admin/code-courriel.js';
import { ESSAIS_CODE_PAR_CONNEXION } from '../../src/routes/admin.js';

const MDP = 'un-mot-de-passe-solide-2026';
const identifiants = { email: 'ousmane@exemple.fr', motDePasse: MDP };

describe('Code de connexion par e-mail : les briques', () => {
  it('le code a toujours 6 chiffres', () => {
    for (let i = 0; i < 200; i++) expect(genererCode()).toMatch(/^\d{6}$/);
  });
  it('seule une empreinte salée est gardée : jamais le code', () => {
    const m = preparerCode('123456');
    expect(JSON.stringify(m)).not.toContain('123456');
    expect(codeCorrect('123456', m)).toBe(true);
    expect(codeCorrect('123 456', m)).toBe(true); // espaces tolérés
    expect(codeCorrect('123457', m)).toBe(false);
    for (const mauvais of ['', '12345', '1234567', 'abcdef', null, undefined])
      expect(codeCorrect(mauvais, m)).toBe(false);
    expect(codeCorrect('123456', null)).toBe(false);
    // deux envois du même code donnent des empreintes différentes (sel)
    expect(preparerCode('123456').empreinte).not.toBe(m.empreinte);
  });
  it('l’adresse est masquée', () => {
    expect(masquerAdresse('ousmane@gmail.com')).toBe('o*****e@gmail.com');
    expect(masquerAdresse('ab@x.fr')).toBe('a*@x.fr');
  });
  it('l’envoyeur renvoie false (sans citer le code) quand le courriel ne part pas', async () => {
    const journal = [];
    const envoyeur = creerEnvoyeurCode({
      transport: {
        sendMail: async () =>
          Promise.reject(Object.assign(new Error('secret 654321'), { code: 'ECONNECTION' })),
      },
      expediteur: 'CampusLens <no@exemple.fr>',
      journal: { error: (...a) => journal.push(a.join(' ')) },
    });
    expect(await envoyeur.envoyer('a@b.fr', '654321')).toBe(false);
    expect(journal.join()).toContain('ECONNECTION');
    expect(journal.join()).not.toContain('654321');
  });
  it('sans transport, l’envoyeur est inactif', () => {
    expect(creerEnvoyeurCode({}).actif).toBe(false);
  });
});

describe('Connexion : mot de passe puis code reçu par e-mail', () => {
  const prisma = prismaTest();
  let boite;
  let app;
  let panne;
  beforeAll(() => viderBase(prisma));
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    await viderBase(prisma);
    await prisma.administrateur.create({
      data: { email: identifiants.email, motDePasseHash: bcrypt.hashSync(MDP, 4), role: 'admin' },
    });
    boite = [];
    panne = false;
    app = createApp({
      prisma,
      envoyeurCode: {
        actif: true,
        envoyer: async (a, code) => {
          if (panne) return false;
          boite.push({ a, code });
          return true;
        },
      },
    });
  });
  const dernierCode = () => boite.at(-1).code;
  const vieillirEnvoi = async (ms) => {
    const ligne = await prisma.sessionAdmin.findFirstOrThrow();
    const attente = ligne.donnees.attente2fa;
    attente.codeCourriel.envoyeLe -= ms;
    await prisma.sessionAdmin.update({
      where: { sid: ligne.sid },
      data: { donnees: { ...ligne.donnees, attente2fa: attente } },
    });
  };

  it('le mot de passe seul n’ouvre PAS la session : un code est envoyé à l’adresse du compte', async () => {
    const agent = request.agent(app);
    const r = await agent.post('/api/admin/login').send(identifiants).expect(200);
    expect(r.body).toMatchObject({ etape: 'code', methode: 'courriel', renvoyerApres: 30 });
    expect(r.body.adresse).toMatch(/^o\*+e@exemple\.fr$/);
    expect(r.body.adresse).not.toBe(identifiants.email);
    expect(boite).toHaveLength(1);
    expect(boite[0].a).toBe(identifiants.email);
    expect(boite[0].code).toMatch(/^\d{6}$/);
    expect((await agent.get('/api/admin/me')).status).toBe(401);
    // Rien d'en clair dans la session enregistrée.
    const ligne = await prisma.sessionAdmin.findFirstOrThrow();
    expect(JSON.stringify(ligne.donnees)).not.toContain(boite[0].code);
  });

  it('le bon code ouvre la session ; il ne sert qu’une fois', async () => {
    const agent = request.agent(app);
    await agent.post('/api/admin/login').send(identifiants).expect(200);
    const code = dernierCode();
    await agent.post('/api/admin/login/code').send({ code }).expect(200);
    expect((await agent.get('/api/admin/me')).status).toBe(200);
    // Le même code sur une nouvelle connexion ne marche pas (un nouveau code a été envoyé).
    const autre = request.agent(app);
    await autre.post('/api/admin/login').send(identifiants).expect(200);
    expect(dernierCode()).not.toBe(code);
    expect((await autre.post('/api/admin/login/code').send({ code })).status).toBe(401);
  });

  it('un mauvais code est refusé ; après 5 erreurs la tentative est détruite', async () => {
    const agent = request.agent(app);
    await agent.post('/api/admin/login').send(identifiants).expect(200);
    const faux = dernierCode() === '000000' ? '111111' : '000000';
    for (let i = 1; i < ESSAIS_CODE_PAR_CONNEXION; i++) {
      const r = await agent.post('/api/admin/login/code').send({ code: faux });
      expect(r.status).toBe(401);
      expect(r.body.error).toBe('Code incorrect.');
    }
    const dernier = await agent.post('/api/admin/login/code').send({ code: faux });
    expect(dernier.body.error).toMatch(/recommencez/i);
    // Même le bon code ne sert plus : refusé (401), ou bloqué par la limite d'essais par adresse IP (429).
    const apres = await agent.post('/api/admin/login/code').send({ code: dernierCode() });
    expect([401, 429]).toContain(apres.status);
    expect((await agent.get('/api/admin/me')).status).toBe(401);
  });

  it('« Renvoyer le code » : refusé avant 30 s (avec le temps restant), accepté après, et l’ancien code ne vaut plus', async () => {
    const agent = request.agent(app);
    await agent.post('/api/admin/login').send(identifiants).expect(200);
    const ancien = dernierCode();
    const tropTot = await agent.post('/api/admin/login/renvoyer');
    expect(tropTot.status).toBe(429);
    expect(tropTot.body.attendre).toBeGreaterThan(0);
    expect(tropTot.body.attendre).toBeLessThanOrEqual(30);
    expect(boite).toHaveLength(1);

    await vieillirEnvoi(31_000);
    const r = await agent.post('/api/admin/login/renvoyer').expect(200);
    expect(r.body.renvoyerApres).toBe(30);
    expect(boite).toHaveLength(2);
    expect(dernierCode()).not.toBe(ancien);
    // L'ancien code est refusé, le nouveau accepté.
    expect((await agent.post('/api/admin/login/code').send({ code: ancien })).status).toBe(401);
    await agent.post('/api/admin/login/code').send({ code: dernierCode() }).expect(200);
  });

  it('au plus 4 envois par connexion', async () => {
    const agent = request.agent(app);
    await agent.post('/api/admin/login').send(identifiants).expect(200);
    for (let i = 0; i < 3; i++) {
      await vieillirEnvoi(31_000);
      await agent.post('/api/admin/login/renvoyer').expect(200);
    }
    expect(boite).toHaveLength(4);
    await vieillirEnvoi(31_000);
    const r = await agent.post('/api/admin/login/renvoyer');
    expect(r.status).toBe(429);
    expect(r.body.error).toMatch(/recommencez/i);
    expect(boite).toHaveLength(4);
  });

  it('« annuler » détruit la connexion en cours : même le bon code ne sert plus', async () => {
    const agent = request.agent(app);
    await agent.post('/api/admin/login').send(identifiants).expect(200);
    const code = dernierCode();
    await agent.post('/api/admin/login/annuler').expect(204);
    expect((await agent.post('/api/admin/login/code').send({ code })).status).toBe(401);
    expect((await agent.get('/api/admin/me')).status).toBe(401);
  });

  it('« annuler » ne touche jamais une session déjà ouverte', async () => {
    const agent = request.agent(app);
    await agent.post('/api/admin/login').send(identifiants).expect(200);
    await agent.post('/api/admin/login/code').send({ code: dernierCode() }).expect(200);
    await agent.post('/api/admin/login/annuler').expect(204);
    expect((await agent.get('/api/admin/me')).status).toBe(200);
  });

  it('« Renvoyer » sans connexion en cours : refusé', async () => {
    expect((await request(app).post('/api/admin/login/renvoyer')).status).toBe(401);
  });

  it('e-mail impossible à envoyer : sans application d’authentification, la connexion est refusée (jamais ouverte sans code)', async () => {
    panne = true;
    const agent = request.agent(app);
    const r = await agent.post('/api/admin/login').send(identifiants);
    expect(r.status).toBe(503);
    expect(r.body.error).toMatch(/Impossible d’envoyer le code/);
    expect((await agent.get('/api/admin/me')).status).toBe(401);
  });

  it('e-mail impossible à envoyer : avec l’application d’authentification, on bascule sur elle', async () => {
    await prisma.administrateur.updateMany({
      data: { totpActifLe: new Date(), totpSecret: 'x', codesSecours: [] },
    });
    panne = true;
    const r = await request(app).post('/api/admin/login').send(identifiants).expect(200);
    expect(r.body).toMatchObject({ etape: 'code', methode: 'application', courrielEchec: true });
  });

  it('mauvais mot de passe : aucun e-mail n’est envoyé', async () => {
    await request(app)
      .post('/api/admin/login')
      .send({ ...identifiants, motDePasse: 'faux' })
      .expect(401);
    expect(boite).toHaveLength(0);
  });
});
