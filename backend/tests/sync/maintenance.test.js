import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { prismaTest, viderBase } from '../helpers/db.js';
import { seed } from '../../src/seed/index.js';
import { createApp } from '../../src/app.js';
import {
  marquerSourcesPerimees,
  mettreAJourAnneeEnCours,
  preparerAnneeSuivante,
  purgerMessagesContact,
  purgerSessionsExpirees,
  maintenanceQuotidienne,
} from '../../src/sync/maintenance.js';
import { sourcesDues, passageDesRobots } from '../../src/sync/planificateur.js';
import { StockageSessions } from '../../src/admin/sessions.js';
import {
  sourceLoyers,
  sourceCrous,
  fausseSource,
  reponse,
  pageHtml,
  pageDroits,
  pageCvec,
  residence,
} from '../helpers/sources.js';

const HEURE = 3_600_000;

describe('Maintenance et planification', () => {
  const prisma = prismaTest();
  beforeAll(() => viderBase(prisma));
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    await viderBase(prisma);
    await seed(prisma);
  });

  describe('année universitaire suivante', () => {
    const annees = () => prisma.anneeUniversitaire.findMany({ orderBy: { dateDebut: 'asc' } });

    it('trop tôt (plus de 4 mois avant la fin de l’année) : rien n’est créé', async () => {
      expect(await preparerAnneeSuivante(prisma, new Date('2027-03-15'))).toBeNull();
      expect(await annees()).toHaveLength(1);
    });

    it('à partir de 4 mois avant la fin : crée l’année suivante, recopie les montants, tous « non vérifiés »', async () => {
      // On valide à la main un paramètre de l'année en cours : sa copie ne doit PAS être vérifiée.
      await prisma.parametre.updateMany({ data: { verifieLe: new Date('2026-10-01') } });
      const nbParametres = await prisma.parametre.count();
      const nbPostes = await prisma.posteRentree.count();

      expect(await preparerAnneeSuivante(prisma, new Date('2027-05-02'))).toBe('2027-2028');
      const [courante, suivante] = await annees();
      expect(courante.enCours).toBe(true); // la bascule reste réservée au 1er septembre
      expect(suivante).toMatchObject({ libelle: '2027-2028', enCours: false });
      expect(suivante.dateDebut.toISOString().slice(0, 10)).toBe('2027-09-01');
      expect(suivante.dateFin.toISOString().slice(0, 10)).toBe('2028-08-31');

      const copies = await prisma.parametre.findMany({ where: { anneeId: suivante.id } });
      expect(copies).toHaveLength(nbParametres);
      expect(copies.every((p) => p.verifieLe === null)).toBe(true);
      const cvecAvant = await prisma.parametre.findFirstOrThrow({
        where: { cle: 'cvec', anneeId: courante.id },
      });
      const cvecApres = copies.find((p) => p.cle === 'cvec');
      expect(Number(cvecApres.valeur)).toBe(Number(cvecAvant.valeur));
      expect(cvecAvant.verifieLe).not.toBeNull(); // l'année en cours n'est pas touchée

      const postes = await prisma.posteRentree.findMany({ where: { anneeId: suivante.id } });
      expect(postes).toHaveLength(nbPostes);
      expect(postes.every((p) => p.verifieLe === null)).toBe(true);
      // Les règles par profil sont recopiées avec les montants.
      expect(postes.find((p) => p.nom === 'CVEC')).toMatchObject({
        parametreCle: 'cvec',
        gratuitBoursier: true,
      });
      expect(postes.find((p) => p.profilCode === 'intl')?.situation).toBe('arrivee');
    });

    it('idempotent : un second passage ne recrée rien', async () => {
      await preparerAnneeSuivante(prisma, new Date('2027-05-02'));
      expect(await preparerAnneeSuivante(prisma, new Date('2027-06-10'))).toBeNull();
      expect(await annees()).toHaveLength(2);
    });

    it('au 1er septembre le site bascule seul ; le robot CVEC retrouve alors son paramètre', async () => {
      const resultat = await maintenanceQuotidienne(prisma, new Date('2027-05-02'));
      expect(resultat.anneePreparee).toBe('2027-2028');
      expect(resultat.anneeEnCours).toBe('2026-2027');

      const septembre = await maintenanceQuotidienne(prisma, new Date('2027-09-02'));
      expect(septembre.anneePreparee).toBeNull();
      expect(septembre.anneeEnCours).toBe('2027-2028');
      const courante = await prisma.anneeUniversitaire.findFirstOrThrow({
        where: { enCours: true },
      });
      expect(courante.libelle).toBe('2027-2028');
      // Le simulateur lit l'année en cours : il a bien des montants (copiés, à vérifier).
      const droits = await prisma.parametre.findFirst({
        where: {
          cle: 'droits_inscription',
          niveau: 'licence',
          profilId: null,
          anneeId: courante.id,
        },
      });
      expect(Number(droits.valeur)).toBe(178);
      expect(droits.verifieLe).toBeNull();
    });
  });

  it('SYN-08 : délai de vérification dépassé → source « à vérifier », mention visible sur le site', async () => {
    const maintenant = new Date('2026-11-05T12:00:00Z');
    const recent = new Date(maintenant - 2 * HEURE);
    const vieux = new Date(maintenant - 400 * HEURE);
    const loyers = await prisma.source.findUniqueOrThrow({ where: { cle: 'loyers' } }); // fréquence 168 h
    const droits = await prisma.source.findUniqueOrThrow({ where: { cle: 'droits' } });
    const cvec = await prisma.source.findUniqueOrThrow({ where: { cle: 'cvec' } });
    await prisma.source.update({
      where: { id: loyers.id },
      data: { statut: 'ok', dernierControle: recent },
    });
    await prisma.source.update({
      where: { id: droits.id },
      data: { statut: 'ok', dernierControle: vieux },
    });
    await prisma.source.update({
      where: { id: cvec.id },
      data: { statut: 'erreur', dernierControle: vieux },
    });
    await prisma.parametre.updateMany({
      where: { sourceId: droits.id },
      data: { verifieLe: vieux },
    });

    const nb = await marquerSourcesPerimees(prisma, maintenant);
    expect(nb).toBeGreaterThanOrEqual(1);
    expect((await prisma.source.findUniqueOrThrow({ where: { id: loyers.id } })).statut).toBe('ok');
    expect((await prisma.source.findUniqueOrThrow({ where: { id: droits.id } })).statut).toBe(
      'a_verifier',
    );
    expect((await prisma.source.findUniqueOrThrow({ where: { id: cvec.id } })).statut).toBe(
      'erreur',
    ); // une erreur reste une erreur

    // Sur le site : la donnée de la source périmée est signalée « à vérifier ».
    const res = await request(createApp({ prisma })).get('/api/parametres');
    const licence = res.body.parametres.find(
      (p) => p.cle === 'droits_inscription' && p.niveau === 'licence' && p.profil === null,
    );
    expect(licence.aVerifier).toBe(true);
    expect(licence.source.statut).toBe('a_verifier');
  });

  it('ne touche pas une source encore dans les délais', async () => {
    const maintenant = new Date();
    await prisma.source.updateMany({ data: { statut: 'ok', dernierControle: maintenant } });
    expect(await marquerSourcesPerimees(prisma, maintenant)).toBe(0);
  });

  it('année en cours : reste inchangée si aucune année ne couvre la date', async () => {
    expect(await mettreAJourAnneeEnCours(prisma, new Date('2035-01-01'))).toBeNull();
    expect(
      (await prisma.anneeUniversitaire.findFirstOrThrow({ where: { enCours: true } })).libelle,
    ).toBe('2026-2027');
  });

  it('RGPD : les messages de contact arrivés à leur date de suppression sont effacés', async () => {
    const maintenant = new Date('2027-05-10T00:00:00Z');
    await prisma.messageContact.createMany({
      data: [
        { objet: 'ancien', message: 'm', email: 'a@x.fr', supprimerApres: new Date('2027-05-01') },
        {
          objet: 'pile',
          message: 'm',
          email: 'b@x.fr',
          supprimerApres: new Date('2027-05-10T00:00:00Z'),
        },
        { objet: 'récent', message: 'm', email: 'c@x.fr', supprimerApres: new Date('2027-11-01') },
      ],
    });
    expect(await purgerMessagesContact(prisma, maintenant)).toBe(2);
    const restants = await prisma.messageContact.findMany();
    expect(restants.map((m) => m.objet)).toEqual(['récent']);
  });

  it('les sessions expirées sont purgées', async () => {
    await prisma.sessionAdmin.createMany({
      data: [
        { sid: 'vieille', donnees: {}, expire: new Date('2020-01-01') },
        { sid: 'valide', donnees: {}, expire: new Date(Date.now() + HEURE) },
      ],
    });
    expect(await purgerSessionsExpirees(prisma)).toBe(1);
    expect((await prisma.sessionAdmin.findMany()).map((s) => s.sid)).toEqual(['valide']);
  });

  it('la maintenance quotidienne enchaîne les 6 tâches', async () => {
    const r = await maintenanceQuotidienne(prisma, new Date('2026-11-05'));
    expect(r).toEqual({
      anneePreparee: null, // novembre : trop tôt pour préparer l'année suivante
      anneeEnCours: '2026-2027',
      sourcesPerimees: expect.any(Number),
      messagesSupprimes: 0,
      avisSupprimes: 0,
      sessionsSupprimees: 0,
    });
  });

  describe('planificateur', () => {
    it('ne lance que les robots dont la fréquence est écoulée', async () => {
      const maintenant = new Date('2026-11-05T12:00:00Z');
      const sources = await prisma.source.findMany();
      const dues = sourcesDues(
        sources.map((s) => ({
          ...s,
          dernierControle:
            s.cle === 'loyers'
              ? new Date(maintenant - HEURE)
              : s.cle === 'cvec'
                ? new Date(maintenant - 500 * HEURE)
                : null,
        })),
        maintenant,
      ).map((s) => s.cle);
      expect(dues).not.toContain('loyers'); // contrôlée il y a 1 h, fréquence 168 h
      expect(dues).toContain('cvec'); // 500 h > 168 h
      expect(dues).toContain('droits'); // jamais contrôlée
      expect(dues).not.toContain(null);
      expect(sources.some((s) => !s.cle)).toBe(true); // les sources sans robot sont ignorées
    });

    it('un passage lance les robots dus, un par un, et journalise sans planter si l’un échoue', async () => {
      const journal = { log: vi.fn(), error: vi.fn() };
      const loyers = sourceLoyers({ 35238: ['Rennes', '14,87'] });
      const crous = sourceCrous([residence(1, 'A', 'Rennes')]);
      const fetchImpl = fausseSource({
        'data.gouv.fr': (u) => loyers(u),
        fr_crous_logement: (u) => crous(u),
        'actualites/A14725': () => pageHtml(pageDroits()),
        'cvec.etudiant.gouv.fr': () => pageHtml(pageCvec()),
        // pages officielles sous veille (aides vérifiées à la main)
        'service-public.': () => pageHtml(`<main><p>${'Contenu officiel. '.repeat(40)}</p></main>`),
        'campusfrance.org': () =>
          pageHtml(`<main><p>${'Contenu officiel. '.repeat(40)}</p></main>`),
        'actionlogement.fr': () =>
          pageHtml(`<main><p>${'Contenu officiel. '.repeat(40)}</p></main>`),
        'etudiant.gouv.fr/fr/restauration': () =>
          pageHtml(`<main><p>${'Contenu officiel. '.repeat(40)}</p></main>`),
        // les pages de Ressources répondent 200
        '': (u) => reponse({ status: 200, url: u }),
      });
      const resultats = await passageDesRobots(prisma, { fetchImpl, journal });
      const par = Object.fromEntries(resultats.map((r) => [r.cle, r.statut]));
      expect(par.loyers).toBe('succes');
      expect(par.logements_crous).toBe('succes');
      expect(par.droits).toBe('en_attente_validation');
      expect(par.cvec).toBe('en_attente_validation');
      expect(par.openfisca).toBeUndefined(); // plus de robot OpenFisca
      expect(par.liens_ressources).toBeDefined();
      expect(par.veille_apl).toBe('aucun_changement'); // première lecture = référence
      expect(journal.log).toHaveBeenCalled();

      // Les pages de transport (simulées ici sans aucun prix) échouent proprement, sans rien casser.
      expect(par.veille_transport_toulouse).toBe('echec');
      await prisma.source.updateMany({
        where: { cle: { startsWith: 'veille_transport_' } },
        data: { dernierControle: new Date(), statut: 'ok' },
      });

      // Deuxième passage immédiat : plus rien n'est « dû » (aucun appel réseau).
      const f2 = fausseSource({});
      expect(await passageDesRobots(prisma, { fetchImpl: f2, journal })).toEqual([]);
      expect(f2.appels).toEqual([]);
    });
  });

  describe('stockage des sessions en base', () => {
    const stockage = () => new StockageSessions(prisma);
    const appel = (fn) =>
      new Promise((resolve, reject) => fn((err, v) => (err ? reject(err) : resolve(v))));

    it('enregistre, relit, prolonge et supprime une session', async () => {
      const s = stockage();
      const sess = { cookie: { expires: new Date(Date.now() + HEURE).toISOString() }, adminId: 7 };
      await appel((cb) => s.set('abc', sess, cb));
      expect((await appel((cb) => s.get('abc', cb))).adminId).toBe(7);
      await appel((cb) =>
        s.touch('abc', { cookie: { expires: new Date(Date.now() + 5 * HEURE).toISOString() } }, cb),
      );
      const ligne = await prisma.sessionAdmin.findUniqueOrThrow({ where: { sid: 'abc' } });
      expect(ligne.expire.getTime()).toBeGreaterThan(Date.now() + 4 * HEURE);
      await appel((cb) => s.destroy('abc', cb));
      expect(await appel((cb) => s.get('abc', cb))).toBeNull();
    });

    it('une session expirée est ignorée', async () => {
      const s = stockage();
      await appel((cb) =>
        s.set('morte', { cookie: { expires: new Date(Date.now() - 1000).toISOString() } }, cb),
      );
      expect(await appel((cb) => s.get('morte', cb))).toBeNull();
    });

    it('la connexion admin survit à un « redémarrage » : une nouvelle app relit la session en base', async () => {
      const bcrypt = (await import('bcrypt')).default;
      await prisma.administrateur.create({
        data: {
          email: 'a@test.fr',
          motDePasseHash: bcrypt.hashSync('un-mot-de-passe-solide', 4),
          role: 'admin',
        },
      });
      const premiere = request.agent(createApp({ prisma }));
      await premiere
        .post('/api/admin/login')
        .send({ email: 'a@test.fr', motDePasse: 'un-mot-de-passe-solide' })
        .expect(200);
      const cookie =
        (await premiere.get('/api/admin/me')).request.header.Cookie ??
        premiere.jar
          .getCookies({ path: '/api/admin', domain: '127.0.0.1', secure: false, script: false })
          .toString();

      const apresRedemarrage = createApp({ prisma }); // nouvelle instance : aucune mémoire partagée
      const res = await request(apresRedemarrage).get('/api/admin/me').set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(await prisma.sessionAdmin.count()).toBeGreaterThanOrEqual(1);
    });
  });
});
