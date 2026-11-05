import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { prismaTest, viderBase } from '../helpers/db.js';
import { seed } from '../../src/seed/index.js';
import { createApp } from '../../src/app.js';
import { synchroniser } from '../../src/sync/moteur.js';
import { robotDroits } from '../../src/sync/robots/pagesOfficielles.js';
import { fausseSource, pageHtml, pageDroits, sourceLoyers } from '../helpers/sources.js';

const MDP = 'un-mot-de-passe-solide-2026';

describe('API admin : sources, changements, historique', () => {
  const prisma = prismaTest();
  let app;
  let admin;
  let relecteur;
  let fetchImpl;

  beforeAll(() => viderBase(prisma));
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    await viderBase(prisma);
    await seed(prisma);
    const hash = bcrypt.hashSync(MDP, 4);
    await prisma.administrateur.create({
      data: { email: 'admin@test.fr', motDePasseHash: hash, role: 'admin' },
    });
    await prisma.administrateur.create({
      data: { email: 'relecteur@test.fr', motDePasseHash: hash, role: 'relecteur' },
    });
    fetchImpl = sourceLoyers({ 35238: ['Rennes', '14,87'] });
    app = createApp({ prisma, fetchImpl });
    admin = request.agent(app);
    relecteur = request.agent(app);
    await admin
      .post('/api/admin/login')
      .send({ email: 'admin@test.fr', motDePasse: MDP })
      .expect(200);
    await relecteur
      .post('/api/admin/login')
      .send({ email: 'relecteur@test.fr', motDePasse: MDP })
      .expect(200);
    await synchroniser(prisma, robotDroits, {
      fetchImpl: fausseSource({ A14725: () => pageHtml(pageDroits({ master: 256 })) }),
    });
  });

  it('API-12 : toutes les routes admin exigent une session', async () => {
    const anonyme = request(app);
    for (const [methode, url] of [
      ['get', '/api/admin/sources'],
      ['get', '/api/admin/changements'],
      ['get', '/api/admin/historique'],
      ['post', '/api/admin/changements/1/valider'],
      ['post', '/api/admin/changements/1/rejeter'],
      ['post', '/api/admin/historique/1/annuler'],
      ['post', '/api/admin/sources/1/synchroniser'],
      ['get', '/api/admin/messages'],
      ['delete', '/api/admin/messages/1'],
    ]) {
      expect((await anonyme[methode](url).send({})).status, `${methode} ${url}`).toBe(401);
    }
  });

  it('état des sources : dernière vérification, statut, fréquence, changements en attente, robot', async () => {
    const res = await admin.get('/api/admin/sources');
    expect(res.status).toBe(200);
    const droits = res.body.find((s) => s.cle === 'droits');
    expect(droits).toMatchObject({
      statut: 'ok',
      robot: true,
      niveau: 3,
      changementsEnAttente: 1,
      aVerifier: false, // source contrôlée à l instant : ses valeurs attendent la validation
    });
    expect(droits.derniereSynchronisation.statut).toBe('en_attente_validation');
    expect(droits.dernierControle).not.toBeNull();
    const fage = res.body.find((s) => s.nom === 'Indicateur du coût de la rentrée');
    expect(fage).toMatchObject({
      robot: false,
      derniereSynchronisation: null,
      changementsEnAttente: 0,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/empreinte|motDePasse/); // aucune donnée interne
  });

  it('liste les changements à valider avec les valeurs proposées et les valeurs actuelles', async () => {
    const res = await admin.get('/api/admin/changements');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const c = res.body[0];
    expect(c.source.organisme).toBe('Service-Public.fr');
    const master = c.suggestions.find((s) => s.niveau === 'master');
    expect(master).toMatchObject({ valeur: 256, valeurActuelle: 255 });
    expect(c.parametres.map((p) => p.cle)).toContain('droits_inscription');
    expect((await admin.get('/api/admin/changements?statut=valide')).body).toEqual([]);
    expect((await admin.get('/api/admin/changements?statut=n-importe-quoi')).status).toBe(400);
  });

  it('E2E-05 (API) : valider un changement met la nouvelle valeur à disposition du public', async () => {
    const [c] = (await admin.get('/api/admin/changements')).body;
    const master = c.suggestions.find((s) => s.niveau === 'master');
    const avant = await request(app).get('/api/parametres');
    expect(
      avant.body.parametres.find(
        (p) => p.cle === 'droits_inscription' && p.niveau === 'master' && !p.profil,
      ).valeur,
    ).toBe(255);

    const res = await relecteur
      .post(`/api/admin/changements/${c.id}/valider`)
      .send({ valeurs: [{ parametreId: master.parametreId, valeur: 256 }] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ statut: 'valide', valeursModifiees: 1 });

    const apres = await request(app).get('/api/parametres');
    const ligne = apres.body.parametres.find(
      (p) => p.cle === 'droits_inscription' && p.niveau === 'master' && !p.profil,
    );
    expect(ligne.valeur).toBe(256);
    expect(ligne.verifieLe).not.toBeNull(); // plus « jamais vérifié »
    expect((await admin.get('/api/admin/changements')).body).toEqual([]);
    expect((await admin.get('/api/admin/changements?statut=valide')).body[0].traitePar).toBe(
      'relecteur@test.fr',
    );
    // Déjà traité : 409 ; inexistant : 404 ; identifiant invalide : 400.
    expect((await admin.post(`/api/admin/changements/${c.id}/valider`).send({})).status).toBe(409);
    expect((await admin.post('/api/admin/changements/999999/valider').send({})).status).toBe(404);
    expect((await admin.post('/api/admin/changements/abc/valider').send({})).status).toBe(400);
  });

  it('rejeter un changement ne modifie aucune valeur publique', async () => {
    const [c] = (await admin.get('/api/admin/changements')).body;
    expect((await admin.post(`/api/admin/changements/${c.id}/rejeter`).send({})).body).toEqual({
      statut: 'rejete',
    });
    const pub = await request(app).get('/api/parametres');
    expect(
      pub.body.parametres.find(
        (p) => p.cle === 'droits_inscription' && p.niveau === 'master' && !p.profil,
      ).valeur,
    ).toBe(255);
    expect((await admin.get('/api/admin/changements?statut=rejete')).body).toHaveLength(1);
  });

  it('historique + annulation : réservée au rôle « admin »', async () => {
    const [c] = (await admin.get('/api/admin/changements')).body;
    const master = c.suggestions.find((s) => s.niveau === 'master');
    await admin
      .post(`/api/admin/changements/${c.id}/valider`)
      .send({ valeurs: [{ parametreId: master.parametreId, valeur: 256 }] });

    const histo = (await relecteur.get('/api/admin/historique')).body;
    expect(histo[0]).toMatchObject({
      tableCible: 'parametre',
      champ: 'valeur',
      ancienneValeur: '255',
      nouvelleValeur: '256',
    });

    const interdit = await relecteur.post(`/api/admin/historique/${histo[0].id}/annuler`).send({});
    expect(interdit.status).toBe(403);
    const ok = await admin.post(`/api/admin/historique/${histo[0].id}/annuler`).send({});
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ restauree: '255' });
    const pub = await request(app).get('/api/parametres');
    expect(
      pub.body.parametres.find(
        (p) => p.cle === 'droits_inscription' && p.niveau === 'master' && !p.profil,
      ).valeur,
    ).toBe(255);
    // Annuler deux fois : refusé (la valeur n'est plus celle de la modification).
    expect((await admin.post(`/api/admin/historique/${histo[0].id}/annuler`).send({})).status).toBe(
      409,
    );
  });

  it('lancer un robot à la main : admin seulement, source sans robot refusée', async () => {
    const loyers = await prisma.source.findUniqueOrThrow({ where: { cle: 'loyers' } });
    const fage = await prisma.source.findFirstOrThrow({ where: { cle: null, organisme: 'FAGE' } });
    expect(
      (await relecteur.post(`/api/admin/sources/${loyers.id}/synchroniser`).send({})).status,
    ).toBe(403);
    expect((await admin.post(`/api/admin/sources/${fage.id}/synchroniser`).send({})).status).toBe(
      404,
    );
    const res = await admin.post(`/api/admin/sources/${loyers.id}/synchroniser`).send({});
    expect(res.status).toBe(200);
    expect(res.body.statut).toBe('succes');
    const villes = await request(app).get('/api/villes');
    expect(villes.body.find((v) => v.nom === 'Rennes').loyerM2Appartement).toBe(14.87);
  });

  describe('messages du formulaire de contact', () => {
    const creer = (objet, email = 'etudiant@exemple.fr') =>
      prisma.messageContact.create({
        data: {
          objet,
          message: `Bonjour, ${objet}`,
          email,
          supprimerApres: new Date(Date.now() + 180 * 86_400_000),
        },
      });

    it('réservés au rôle « admin » : le relecteur n’y a pas accès (données personnelles)', async () => {
      const m = await creer('Question');
      expect((await relecteur.get('/api/admin/messages')).status).toBe(403);
      expect((await relecteur.delete(`/api/admin/messages/${m.id}`)).status).toBe(403);
      expect(await prisma.messageContact.count()).toBe(1); // rien supprimé
    });

    it('liste les messages du plus récent au plus ancien, avec leur date de suppression automatique', async () => {
      await creer('Premier', 'a@exemple.fr');
      await creer('Deuxième', 'b@exemple.fr');
      const res = await admin.get('/api/admin/messages');
      expect(res.status).toBe(200);
      expect(res.body.map((m) => m.objet)).toEqual(['Deuxième', 'Premier']);
      expect(res.body[0]).toMatchObject({ email: 'b@exemple.fr', message: 'Bonjour, Deuxième' });
      expect(res.body[0].supprimerApres).toBeTruthy();
      expect(res.body[0].creeLe).toBeTruthy();
    });

    it('un message envoyé depuis le formulaire public apparaît dans la liste', async () => {
      await request(app)
        .post('/api/contact')
        .send({ objet: 'Bourse', email: 'x@exemple.fr', message: 'Comment faire ?' })
        .expect(201);
      const res = await admin.get('/api/admin/messages');
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ objet: 'Bourse', email: 'x@exemple.fr' });
    });

    it('non lus : le compteur de la pastille ; « lu » le décrémente ; « tout lire » le remet à zéro', async () => {
      const a = await creer('A');
      await creer('B');
      await creer('C');
      expect((await admin.get('/api/admin/messages/non-lus')).body).toEqual({ nombre: 3 });
      expect((await admin.get('/api/admin/messages')).body.every((m) => m.luLe === null)).toBe(
        true,
      );

      expect((await admin.post(`/api/admin/messages/${a.id}/lu`)).status).toBe(204);
      expect((await admin.get('/api/admin/messages/non-lus')).body).toEqual({ nombre: 2 });
      expect(
        (await admin.get('/api/admin/messages')).body.find((m) => m.id === a.id).luLe,
      ).not.toBeNull();
      // Idempotent : marquer deux fois ne change pas la date de lecture.
      const premiere = (await prisma.messageContact.findUniqueOrThrow({ where: { id: a.id } }))
        .luLe;
      await admin.post(`/api/admin/messages/${a.id}/lu`).expect(204);
      expect((await prisma.messageContact.findUniqueOrThrow({ where: { id: a.id } })).luLe).toEqual(
        premiere,
      );

      expect((await admin.post('/api/admin/messages/tout-lire')).body).toEqual({ marques: 2 });
      expect((await admin.get('/api/admin/messages/non-lus')).body).toEqual({ nombre: 0 });
    });

    it('non lus : réservé au rôle admin ; message inconnu → 404 ; identifiant invalide → 400 ; sans session → 401', async () => {
      const m = await creer('Privé');
      for (const [methode, url] of [
        ['get', '/api/admin/messages/non-lus'],
        ['post', '/api/admin/messages/tout-lire'],
        ['post', `/api/admin/messages/${m.id}/lu`],
      ]) {
        expect((await relecteur[methode](url)).status, `relecteur ${url}`).toBe(403);
        expect((await request(app)[methode](url)).status, `anonyme ${url}`).toBe(401);
      }
      expect(
        (await prisma.messageContact.findUniqueOrThrow({ where: { id: m.id } })).luLe,
      ).toBeNull(); // rien modifié
      expect((await admin.post('/api/admin/messages/999999/lu')).status).toBe(404);
      expect((await admin.post('/api/admin/messages/abc/lu')).status).toBe(400);
    });

    it('un nouveau message envoyé depuis le site est compté comme non lu', async () => {
      await request(app)
        .post('/api/contact')
        .send({ objet: 'Bourse', email: 'x@exemple.fr', message: 'Comment faire ?' })
        .expect(201);
      expect((await admin.get('/api/admin/messages/non-lus')).body).toEqual({ nombre: 1 });
    });

    it('suppression anticipée (droit à l’effacement) : le message disparaît ; inconnu → 404 ; id invalide → 400', async () => {
      const m = await creer('À effacer');
      expect((await admin.delete(`/api/admin/messages/${m.id}`)).status).toBe(204);
      expect(await prisma.messageContact.count()).toBe(0);
      expect((await admin.delete(`/api/admin/messages/${m.id}`)).status).toBe(404);
      expect((await admin.delete('/api/admin/messages/abc')).status).toBe(400);
    });
  });

  it('la déconnexion invalide la session (supprimée en base)', async () => {
    expect(await prisma.sessionAdmin.count()).toBeGreaterThanOrEqual(2);
    await admin.post('/api/admin/logout').expect(204);
    expect((await admin.get('/api/admin/sources')).status).toBe(401);
  });
});
