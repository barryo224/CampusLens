import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prismaTest, viderBase } from '../helpers/db.js';
import { seed } from '../../src/seed/index.js';
import { synchroniser } from '../../src/sync/moteur.js';
import { robotLoyers } from '../../src/sync/robots/loyers.js';
import { robotLogementsCrous, extraireLoyers } from '../../src/sync/robots/logementsCrous.js';
import { robotDroits, robotCvec } from '../../src/sync/robots/pagesOfficielles.js';
import { robotLiensRessources } from '../../src/sync/robots/liensRessources.js';
import {
  fausseSource,
  reponse,
  sourceLoyers,
  sourceCrous,
  residence,
  RESIDENCE_REELLE,
  pageDroits,
  pageCvec,
  pageHtml,
} from '../helpers/sources.js';
import {
  validerChangement,
  rejeterChangement,
  annulerModification,
} from '../../src/admin/changements.js';

const LOYERS = {
  35238: ['Rennes', '14,87'],
  31555: ['Toulouse', '13,98'],
  49007: ['Angers', '14,55'],
};

describe('Synchronisation', () => {
  const prisma = prismaTest();
  let admin;

  beforeAll(async () => {
    await viderBase(prisma);
  });
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    await viderBase(prisma);
    await seed(prisma);
    admin = await prisma.administrateur.create({
      data: { email: 'a@test.fr', motDePasseHash: 'x', role: 'admin' },
    });
  });

  const ville = (nom) => prisma.ville.findFirstOrThrow({ where: { nom } });
  const source = (cle) => prisma.source.findUniqueOrThrow({ where: { cle } });
  const param = (cle, niveau = 'aucun') =>
    prisma.parametre.findFirstOrThrow({
      where: { cle, niveau, profilId: null, annee: { enCours: true } },
    });

  // ───────────────────── Niveau 1 : carte des loyers ─────────────────────
  describe('niveau 1 — carte des loyers', () => {
    it('première lecture : remplit les loyers au m² et le studio estimé (surface lue en base)', async () => {
      const r = await synchroniser(prisma, robotLoyers, { fetchImpl: sourceLoyers(LOYERS) });
      expect(r.statut).toBe('succes');
      const rennes = await ville('Rennes');
      expect(Number(rennes.loyerM2Appartement)).toBe(14.87);
      expect(Number(rennes.loyerStudioEstime)).toBe(297.4); // 14,87 × 20 m² (paramètre surface_studio_m2)
      expect(rennes.verifieLe).not.toBeNull();
      expect((await ville('Paris')).loyerM2Appartement).toBeNull(); // absente du fichier : on n'invente rien
      const s = await source('loyers');
      expect(s.statut).toBe('ok');
      expect(s.empreinte).toMatch(/^[0-9a-f]{64}$/);
    });

    it('prend automatiquement l’édition la plus récente du jeu de données', async () => {
      const f = sourceLoyers(LOYERS, { annee: 2025 });
      await synchroniser(prisma, robotLoyers, { fetchImpl: f });
      expect(f.appels.some((u) => u.includes('ancien-2024'))).toBe(false);
      expect(f.appels.some((u) => u.includes('pred-app-mef-dhup.csv'))).toBe(true);
    });

    it('SYN-01 : source inchangée → aucune écriture sauf dernier_controle ; statut aucun_changement', async () => {
      await synchroniser(prisma, robotLoyers, { fetchImpl: sourceLoyers(LOYERS) });
      const avant = await ville('Rennes');
      const nbHistorique = await prisma.historiqueValeur.count();
      const controleAvant = (await source('loyers')).dernierControle;

      await new Promise((r) => setTimeout(r, 15));
      const r = await synchroniser(prisma, robotLoyers, { fetchImpl: sourceLoyers(LOYERS) });

      expect(r.statut).toBe('aucun_changement');
      expect(await prisma.historiqueValeur.count()).toBe(nbHistorique);
      expect(await ville('Rennes')).toEqual(avant); // ligne intacte, y compris verifieLe
      expect((await source('loyers')).dernierControle.getTime()).toBeGreaterThan(
        controleAvant.getTime(),
      );
      const dernier = await prisma.synchronisation.findFirst({ orderBy: { id: 'desc' } });
      expect(dernier.statut).toBe('aucun_changement');
      expect(dernier.nbChangements).toBe(0);
    });

    it('SYN-02 : nouvelle valeur → valeur mise à jour + ligne dans historique_valeur (ancienne et nouvelle)', async () => {
      await synchroniser(prisma, robotLoyers, { fetchImpl: sourceLoyers(LOYERS) });
      const r = await synchroniser(prisma, robotLoyers, {
        fetchImpl: sourceLoyers({ ...LOYERS, 35238: ['Rennes', '15,50'] }),
      });

      expect(r.statut).toBe('succes');
      expect(r.nbChangements).toBe(2); // loyer au m² + studio estimé
      const rennes = await ville('Rennes');
      expect(Number(rennes.loyerM2Appartement)).toBe(15.5);
      expect(Number(rennes.loyerStudioEstime)).toBe(310);
      const h = await prisma.historiqueValeur.findFirstOrThrow({
        where: { tableCible: 'ville', ligneId: String(rennes.id), champ: 'loyerM2Appartement' },
        orderBy: { id: 'desc' },
      });
      expect(h.ancienneValeur).toBe('14.87');
      expect(h.nouvelleValeur).toBe('15.5');
      expect(h.synchronisationId).toBe(r.synchronisationId);
      // Les autres villes, inchangées, ne produisent aucune ligne d'historique.
      const toulouse = await ville('Toulouse');
      expect(
        await prisma.historiqueValeur.count({
          where: { ligneId: String(toulouse.id), tableCible: 'ville' },
        }),
      ).toBe(2); // seulement la 1re lecture
    });

    it('SYN-03 : données au mauvais format → rejet Zod, aucune modification, source en « erreur »', async () => {
      await synchroniser(prisma, robotLoyers, { fetchImpl: sourceLoyers(LOYERS) });
      const avant = await ville('Rennes');
      const histoAvant = await prisma.historiqueValeur.count();

      for (const [mauvais, attendu] of [
        [{ ...LOYERS, 35238: ['Rennes', 'abc'] }, /Loyer invalide/],
        [{ ...LOYERS, 35238: ['Rennes', '-4,2'] }, /Loyer invalide/],
        [{ ...LOYERS, 35238: ['Rennes', '999999'] }, /Loyer invalide/],
      ]) {
        const r = await synchroniser(prisma, robotLoyers, { fetchImpl: sourceLoyers(mauvais) });
        expect(r.statut).toBe('echec');
        expect(r.message).toMatch(attendu);
        expect((await source('loyers')).statut).toBe('erreur');
        expect(await ville('Rennes')).toEqual(avant);
        expect(await prisma.historiqueValeur.count()).toBe(histoAvant);
      }
      const sansColonne = await synchroniser(prisma, robotLoyers, {
        fetchImpl: sourceLoyers(LOYERS, { entete: '"id_zone";"INSEE_C";"LIBGEO"' }),
      });
      expect(sansColonne.statut).toBe('echec');
      expect(sansColonne.message).toMatch(/Colonne/);
      const dernier = await prisma.synchronisation.findFirst({ orderBy: { id: 'desc' } });
      expect(dernier.statut).toBe('echec');
      expect(dernier.messageErreur).toBeTruthy();
    });

    it('SYN-04 : source injoignable (timeout, 500) → échec enregistré, données conservées, nouvel essai au passage suivant', async () => {
      await synchroniser(prisma, robotLoyers, { fetchImpl: sourceLoyers(LOYERS) });
      const avant = await ville('Rennes');

      const timeout = Object.assign(new Error('délai'), { name: 'TimeoutError' });
      const r1 = await synchroniser(prisma, robotLoyers, {
        fetchImpl: fausseSource({ 'data.gouv.fr': timeout }),
      });
      expect(r1.statut).toBe('echec');
      expect(r1.message).toMatch(/injoignable/);

      const r2 = await synchroniser(prisma, robotLoyers, {
        fetchImpl: fausseSource({ 'data.gouv.fr': () => reponse({ status: 500 }) }),
      });
      expect(r2.statut).toBe('echec');
      expect(r2.message).toMatch(/500/);

      expect(await ville('Rennes')).toEqual(avant); // données conservées
      expect((await source('loyers')).statut).toBe('erreur');

      // Nouvel essai : la source répond, tout revient à la normale.
      const r3 = await synchroniser(prisma, robotLoyers, {
        fetchImpl: sourceLoyers({ ...LOYERS, 35238: ['Rennes', '16,00'] }),
      });
      expect(r3.statut).toBe('succes');
      expect((await source('loyers')).statut).toBe('ok');
      expect(Number((await ville('Rennes')).loyerM2Appartement)).toBe(16);
    });

    it('paramètre surface_studio_m2 absent → échec explicite, rien de modifié', async () => {
      await prisma.parametre.deleteMany({ where: { cle: 'surface_studio_m2' } });
      const r = await synchroniser(prisma, robotLoyers, { fetchImpl: sourceLoyers(LOYERS) });
      expect(r.statut).toBe('echec');
      expect(r.message).toMatch(/surface_studio_m2/);
      expect((await ville('Rennes')).loyerM2Appartement).toBeNull();
    });

    it('SYN-10 : changement d’année universitaire → le simulateur prend les paramètres de la nouvelle année', async () => {
      const { mettreAJourAnneeEnCours } = await import('../../src/sync/maintenance.js');
      const src = await source('cvec');
      const nouvelle = await prisma.anneeUniversitaire.create({
        data: {
          libelle: '2027-2028',
          dateDebut: new Date('2027-09-01'),
          dateFin: new Date('2028-08-31'),
          enCours: false,
        },
      });
      await prisma.parametre.create({
        data: {
          cle: 'cvec',
          niveau: 'aucun',
          anneeId: nouvelle.id,
          valeur: 110,
          unite: '€ / an',
          sourceId: src.id,
        },
      });

      expect(await mettreAJourAnneeEnCours(prisma, new Date('2027-06-15'))).toBe('2026-2027'); // pas encore
      const supertest = (await import('supertest')).default;
      const { createApp } = await import('../../src/app.js');
      const app = createApp({ prisma });
      const avant = await supertest(app).get('/api/parametres?annee=en_cours');
      expect(avant.body.annee.libelle).toBe('2026-2027');

      expect(await mettreAJourAnneeEnCours(prisma, new Date('2027-09-02'))).toBe('2027-2028');
      const apres = await supertest(app).get('/api/parametres?annee=en_cours');
      expect(apres.body.annee.libelle).toBe('2027-2028');
      expect(apres.body.parametres.find((p) => p.cle === 'cvec').valeur).toBe(110); // sans changer une ligne de code
      expect(await prisma.anneeUniversitaire.count({ where: { enCours: true } })).toBe(1);
    });
  });

  // ───────────────────── Niveau 1 : logements CROUS ─────────────────────
  describe('niveau 1 — logements CROUS', () => {
    it('extrait la fourchette de loyers du texte libre réel, sans dépôt de garantie ni parking', () => {
      expect(extraireLoyers(RESIDENCE_REELLE.infos)).toEqual({ min: 269, max: 342 });
      expect(extraireLoyers('Dépôt de garantie : 250 €')).toBeNull();
      expect(extraireLoyers('Chambre à 5 € par mois, parking 40 €')).toBeNull();
      expect(extraireLoyers(null)).toBeNull();
      expect(extraireLoyers('Studio : 480,50 €')).toEqual({ min: 480.5, max: 480.5 });
    });

    it('recopie les résidences des villes suivies et compte celles de chaque ville', async () => {
      const f = sourceCrous([
        { ...RESIDENCE_REELLE, zone: 'Angers' },
        residence(2, 'Cité U Belle-Beille', 'Angers', 'Chambre : 310 €'),
        residence(3, 'Résidence Villejean', 'Rennes'),
        residence(4, 'Résidence hors suivi', 'Village-Perdu', 'Chambre : 200 €'),
        residence(5, 'Cité Saint-Étienne', 'Saint-Etienne', 'Chambre : 250 €'), // sans accent dans la source
      ]);
      const r = await synchroniser(prisma, robotLogementsCrous, { fetchImpl: f });
      expect(r.statut).toBe('succes');
      expect((await ville('Angers')).nbLogementsCrous).toBe(2);
      expect((await ville('Rennes')).nbLogementsCrous).toBe(1);
      expect((await ville('Saint-Étienne')).nbLogementsCrous).toBe(1);
      expect(await prisma.logementCrous.count()).toBe(4); // la résidence d'une ville non suivie est ignorée
      const meyran = await prisma.logementCrous.findFirstOrThrow({
        where: { nomResidence: 'Cité U Arc de Meyran' },
      });
      expect([Number(meyran.loyerMin), Number(meyran.loyerMax)]).toEqual([269, 342]);
    });

    it('une résidence retirée de la source disparaît ; la suppression est journalisée', async () => {
      await synchroniser(prisma, robotLogementsCrous, {
        fetchImpl: sourceCrous([residence(1, 'A', 'Rennes'), residence(2, 'B', 'Rennes')]),
      });
      expect((await ville('Rennes')).nbLogementsCrous).toBe(2);
      const r = await synchroniser(prisma, robotLogementsCrous, {
        fetchImpl: sourceCrous([residence(1, 'A', 'Rennes')]),
      });
      expect(r.statut).toBe('succes');
      expect((await ville('Rennes')).nbLogementsCrous).toBe(1);
      const h = await prisma.historiqueValeur.findFirst({
        where: { tableCible: 'logement_crous', ancienneValeur: 'B', nouvelleValeur: null },
      });
      expect(h).not.toBeNull();
    });

    it('un fichier vide ou invalide n’efface jamais les résidences existantes', async () => {
      await synchroniser(prisma, robotLogementsCrous, {
        fetchImpl: sourceCrous([residence(1, 'A', 'Rennes')]),
      });
      for (const corps of ['[]', 'pas du json', '[{"id":"x"}]', '{"results":[]}']) {
        const f = fausseSource({ fr_crous_logement: () => reponse({ texte: corps }) });
        const r = await synchroniser(prisma, robotLogementsCrous, { fetchImpl: f });
        expect(r.statut, corps).toBe('echec');
      }
      expect(await prisma.logementCrous.count()).toBe(1);
      expect((await ville('Rennes')).nbLogementsCrous).toBe(1);
    });
  });

  // ───────────────────── Niveau 3 : veille de pages + validation ─────────────────────
  describe('niveau 3 — veille de pages et validation admin', () => {
    const fetchDroits = (opts) =>
      fausseSource({ 'actualites/A14725': () => pageHtml(pageDroits(opts)) });

    it('SYN-05 : page web modifiée → changement « à valider », valeur affichée inchangée', async () => {
      const r = await synchroniser(prisma, robotDroits, { fetchImpl: fetchDroits() });
      expect(r.statut).toBe('en_attente_validation');
      const c = await prisma.changementDetecte.findFirstOrThrow({ include: { source: true } });
      expect(c.statut).toBe('a_valider');
      expect(c.resume).toMatch(/master\) = 255 \(actuel : 255\)/); // le seed est déjà à 255
      expect(JSON.parse(c.valeurProposee)).toHaveLength(2); // licence et master repérés
      expect(Number((await param('droits_inscription', 'licence')).valeur)).toBe(178);
      expect((await source('droits')).empreinte).toBeNull(); // la référence ne bouge qu'après validation
      expect((await source('droits')).statut).toBe('ok');
    });

    it('un même changement non traité n’est pas signalé deux fois', async () => {
      await synchroniser(prisma, robotDroits, { fetchImpl: fetchDroits() });
      const r2 = await synchroniser(prisma, robotDroits, { fetchImpl: fetchDroits() });
      expect(r2.nbChangements).toBe(0);
      expect(await prisma.changementDetecte.count()).toBe(1);
    });

    it('SYN-06 : l’admin valide → valeur mise à jour + historique + statut « valide »', async () => {
      await prisma.parametre.updateMany({
        where: { cle: 'droits_inscription', niveau: 'master', profilId: null },
        data: { valeur: 254 },
      });
      await synchroniser(prisma, robotDroits, { fetchImpl: fetchDroits({ master: 255 }) });
      const c = await prisma.changementDetecte.findFirstOrThrow();
      const master = await param('droits_inscription', 'master');
      expect(Number(master.valeur)).toBe(254); // toujours l'ancienne tant que personne n'a validé

      const res = await validerChangement(prisma, c.id, admin.id, [
        { parametreId: master.id, valeur: 255 },
      ]);
      expect(res).toEqual({ statut: 'valide', valeursModifiees: 1 });

      const apres = await param('droits_inscription', 'master');
      expect(Number(apres.valeur)).toBe(255);
      expect(apres.verifieLe).not.toBeNull();
      const h = await prisma.historiqueValeur.findFirstOrThrow({
        where: { tableCible: 'parametre', ligneId: String(master.id) },
      });
      expect([h.ancienneValeur, h.nouvelleValeur]).toEqual(['254', '255']);
      const vu = await prisma.changementDetecte.findUniqueOrThrow({ where: { id: c.id } });
      expect(vu.statut).toBe('valide');
      expect(vu.traiteParId).toBe(admin.id);
      expect(vu.traiteLe).not.toBeNull();
      expect((await source('droits')).empreinte).toBe(c.nouvelleEmpreinte);
      expect((await param('droits_inscription', 'licence')).verifieLe).not.toBeNull(); // confirmé aussi

      // La page n'a plus bougé : le prochain passage ne dit rien (la validation est mémorisée).
      const suite = await synchroniser(prisma, robotDroits, {
        fetchImpl: fetchDroits({ master: 255 }),
      });
      expect(suite.statut).toBe('aucun_changement');
      // Retraiter un changement déjà traité est refusé.
      await expect(validerChangement(prisma, c.id, admin.id)).rejects.toThrow(/déjà été traité/);
    });

    it('la validation refuse les valeurs invalides et les paramètres d’une autre source', async () => {
      await synchroniser(prisma, robotDroits, { fetchImpl: fetchDroits() });
      const c = await prisma.changementDetecte.findFirstOrThrow();
      const seuil = await param('seuil_fragile');
      await expect(
        validerChangement(prisma, c.id, admin.id, [{ parametreId: seuil.id, valeur: 1 }]),
      ).rejects.toThrow(/n'appartient pas/);
      await expect(
        validerChangement(prisma, c.id, admin.id, [{ parametreId: 1, valeur: -5 }]),
      ).rejects.toThrow(/invalides/);
      expect(
        (await prisma.changementDetecte.findUniqueOrThrow({ where: { id: c.id } })).statut,
      ).toBe('a_valider');
    });

    it('SYN-07 : l’admin rejette → valeur inchangée, statut « rejete », pas de nouvelle alerte pour la même page', async () => {
      await synchroniser(prisma, robotDroits, { fetchImpl: fetchDroits({ master: 999 }) });
      const c = await prisma.changementDetecte.findFirstOrThrow();
      const avant = await param('droits_inscription', 'master');

      expect(await rejeterChangement(prisma, c.id, admin.id)).toEqual({ statut: 'rejete' });
      const apres = await param('droits_inscription', 'master');
      expect(Number(apres.valeur)).toBe(Number(avant.valeur));
      expect(apres.verifieLe).toBeNull(); // rien n'est présenté comme vérifié
      expect(
        (await prisma.changementDetecte.findUniqueOrThrow({ where: { id: c.id } })).statut,
      ).toBe('rejete');
      expect(await prisma.historiqueValeur.count({ where: { tableCible: 'parametre' } })).toBe(0);

      const suite = await synchroniser(prisma, robotDroits, {
        fetchImpl: fetchDroits({ master: 999 }),
      });
      expect(suite.statut).toBe('aucun_changement');
    });

    it('page modifiée après validation → nouveau changement (une vraie évolution est détectée)', async () => {
      await synchroniser(prisma, robotDroits, { fetchImpl: fetchDroits({ licence: 178 }) });
      await validerChangement(
        prisma,
        (await prisma.changementDetecte.findFirstOrThrow()).id,
        admin.id,
        [],
      );
      const r = await synchroniser(prisma, robotDroits, {
        fetchImpl: fetchDroits({ licence: 181 }),
      });
      expect(r.statut).toBe('en_attente_validation');
      expect(await prisma.changementDetecte.count({ where: { statut: 'a_valider' } })).toBe(1);
      expect(Number((await param('droits_inscription', 'licence')).valeur)).toBe(178); // inchangée
    });

    it('un changement de mise en page (menu, pied de page, scripts) ne déclenche aucune alerte', async () => {
      await synchroniser(prisma, robotDroits, { fetchImpl: fetchDroits() });
      await validerChangement(
        prisma,
        (await prisma.changementDetecte.findFirstOrThrow()).id,
        admin.id,
        [],
      );
      const autrePage = pageDroits()
        .replace(
          '<header>Menu du site</header>',
          '<header>Autre menu <script>track(123)</script></header>',
        )
        .replace(
          '<footer>Pied de page</footer>',
          '<footer>Nouveau pied</footer><!-- commentaire -->',
        );
      const r = await synchroniser(prisma, robotDroits, {
        fetchImpl: fausseSource({ A14725: () => pageHtml(autrePage) }),
      });
      expect(r.statut).toBe('aucun_changement');
    });

    it('page d’erreur ou vide → échec, rien d’enregistré (SYN-03 pour les pages)', async () => {
      for (const html of [
        '<html><body>Erreur 503 - Le service en ligne est provisoirement indisponible</body></html>',
        '<html><body><main>Trop court</main></body></html>',
      ]) {
        const r = await synchroniser(prisma, robotDroits, {
          fetchImpl: fausseSource({ A14725: () => pageHtml(html) }),
        });
        expect(r.statut).toBe('echec');
      }
      expect(await prisma.changementDetecte.count()).toBe(0);
      const r503 = await synchroniser(prisma, robotDroits, {
        fetchImpl: fausseSource({ A14725: () => reponse({ status: 503 }) }),
      });
      expect(r503.statut).toBe('echec');
    });

    it('CVEC : repère le montant malgré des entités HTML encodées deux fois', async () => {
      await synchroniser(prisma, robotCvec, {
        fetchImpl: fausseSource({
          'cvec.etudiant.gouv.fr': () => pageHtml(pageCvec({ montant: 108 })),
        }),
      });
      const c = await prisma.changementDetecte.findFirstOrThrow();
      const [s] = JSON.parse(c.valeurProposee);
      expect(s).toMatchObject({
        cle: 'cvec',
        annee: '2026-2027',
        valeurActuelle: 105,
        valeur: 108,
      });
      await validerChangement(prisma, c.id, admin.id, [
        { parametreId: s.parametreId, valeur: 108 },
      ]);
      expect(Number((await param('cvec')).valeur)).toBe(108);
    });

    it('CVEC : année inconnue de la base → pas de valeur devinée, mais le changement est signalé', async () => {
      await synchroniser(prisma, robotCvec, {
        fetchImpl: fausseSource({
          'cvec.etudiant.gouv.fr': () => pageHtml(pageCvec({ annee: '2031-2032' })),
        }),
      });
      const c = await prisma.changementDetecte.findFirstOrThrow();
      expect(c.valeurProposee).toBeNull();
      expect(c.resume).toMatch(/Aucune valeur n’a pu être repérée/);
    });
  });

  // ───────────────────── Liens, verrou, annulation ─────────────────────
  describe('liens de la page Ressources', () => {
    it('SYN-09 : lien devenu 404 → statut_lien = casse ; déplacé → deplace ; une panne passagère ne change rien', async () => {
      const f = fausseSource({
        'messervices.etudiant.gouv.fr': () => reponse({ status: 404 }),
        'visale.fr': () =>
          reponse({ status: 200, url: 'https://www.visale.fr/nouvelle-page', redirige: true }),
        'caf.fr': () => reponse({ status: 503 }),
      });
      const r = await synchroniser(prisma, robotLiensRessources, { fetchImpl: f });
      expect(r.statut).toBe('succes');
      const statut = async (mot) =>
        (await prisma.ressource.findFirstOrThrow({ where: { url: { contains: mot } } })).statutLien;
      expect(await statut('messervices')).toBe('casse');
      expect(await statut('visale')).toBe('deplace');
      expect(await statut('caf.fr')).toBe('ok'); // 503 : on ne conclut pas que le lien est cassé
      expect(await prisma.historiqueValeur.count({ where: { tableCible: 'ressource' } })).toBe(2);

      // Signalement sur la page Ressources (API publique).
      const supertest = (await import('supertest')).default;
      const { createApp } = await import('../../src/app.js');
      const res = await supertest(createApp({ prisma })).get('/api/ressources');
      expect(res.body.find((x) => x.url.includes('messervices')).statutLien).toBe('casse');

      // Le lien est réparé : retour à « ok ».
      const f2 = fausseSource({
        messervices: () =>
          reponse({ status: 200, url: 'https://www.messervices.etudiant.gouv.fr/' }),
        'visale.fr': () => reponse({ status: 200, url: 'https://www.visale.fr' }),
        'caf.fr': () => reponse({ status: 200, url: 'https://www.caf.fr' }),
      });
      await synchroniser(prisma, robotLiensRessources, { fetchImpl: f2 });
      expect(await statut('messervices')).toBe('ok');
    });

    it('une simple redirection http → https ou vers « www » n’est pas un lien déplacé', async () => {
      const f = fausseSource({
        '': (u) =>
          reponse({
            status: 200,
            url: u.replace('https://www.', 'https://') + '/',
            redirige: true,
          }),
      });
      await synchroniser(prisma, robotLiensRessources, { fetchImpl: f });
      const statuts = (await prisma.ressource.findMany()).map((x) => x.statutLien);
      expect(new Set(statuts)).toEqual(new Set(['ok']));
    });
  });

  describe('verrou (SYN-11) et annulation (SYN-12)', () => {
    it('SYN-11 : deux robots lancés en même temps sur la même source → un seul s’exécute', async () => {
      const lente = fausseSource({
        'data.gouv.fr/api/1/datasets': async () => {
          await new Promise((r) => setTimeout(r, 150));
          return (await import('../helpers/sources.js')).recherchePourLoyers();
        },
        'pred-app-mef-dhup.csv': () => sourceLoyersCsv(),
      });
      const [a, b] = await Promise.all([
        synchroniser(prisma, robotLoyers, { fetchImpl: lente }),
        synchroniser(prisma, robotLoyers, { fetchImpl: lente }),
      ]);
      const statuts = [a.statut, b.statut].sort();
      expect(statuts).toEqual(['ignoree', 'succes']);
      expect(await prisma.synchronisation.count()).toBe(1); // l'appel ignoré n'a rien enregistré
      expect(await prisma.synchronisation.count({ where: { statut: 'en_cours' } })).toBe(0); // verrou libéré
      // Une fois terminé, un nouveau passage est possible.
      const c = await synchroniser(prisma, robotLoyers, { fetchImpl: sourceLoyers(LOYERS) });
      expect(c.statut).toBe('aucun_changement');
    });

    it('le verrou est libéré même en cas d’échec', async () => {
      await synchroniser(prisma, robotLoyers, {
        fetchImpl: fausseSource({ 'data.gouv.fr': new Error('x') }),
      });
      expect(await prisma.synchronisation.count({ where: { statut: 'en_cours' } })).toBe(0);
    });

    it('un verrou périmé (processus planté) ne bloque pas les passages suivants', async () => {
      const s = await source('loyers');
      await prisma.synchronisation.create({
        data: { sourceId: s.id, statut: 'en_cours', debut: new Date(Date.now() - 2 * 3_600_000) },
      });
      const r = await synchroniser(prisma, robotLoyers, { fetchImpl: sourceLoyers(LOYERS) });
      expect(r.statut).toBe('succes');
      const morte = await prisma.synchronisation.findFirstOrThrow({ orderBy: { id: 'asc' } });
      expect(morte.statut).toBe('echec');
      expect(morte.messageErreur).toMatch(/périmé/);
    });

    it('SYN-12 : annulation d’une erreur → restauration de l’ancienne valeur depuis historique_valeur', async () => {
      await synchroniser(prisma, robotLoyers, { fetchImpl: sourceLoyers(LOYERS) });
      await synchroniser(prisma, robotLoyers, {
        fetchImpl: sourceLoyers({ ...LOYERS, 35238: ['Rennes', '99,00'] }),
      }); // « erreur » de la source
      const rennes = await ville('Rennes');
      expect(Number(rennes.loyerM2Appartement)).toBe(99);
      const h = await prisma.historiqueValeur.findFirstOrThrow({
        where: { ligneId: String(rennes.id), champ: 'loyerM2Appartement', nouvelleValeur: '99' },
      });

      const res = await annulerModification(prisma, h.id);
      expect(res.restauree).toBe('14.87');
      expect(Number((await ville('Rennes')).loyerM2Appartement)).toBe(14.87);
      // L'annulation est elle-même journalisée.
      const retour = await prisma.historiqueValeur.findFirstOrThrow({
        where: { ligneId: String(rennes.id), champ: 'loyerM2Appartement' },
        orderBy: { id: 'desc' },
      });
      expect([retour.ancienneValeur, retour.nouvelleValeur]).toEqual(['99', '14.87']);
      expect(retour.synchronisationId).toBeNull();
    });

    it('SYN-12 bis : refuse d’annuler si la valeur a encore changé depuis (rien n’est écrasé)', async () => {
      await synchroniser(prisma, robotLoyers, { fetchImpl: sourceLoyers(LOYERS) });
      await synchroniser(prisma, robotLoyers, {
        fetchImpl: sourceLoyers({ ...LOYERS, 35238: ['Rennes', '15,00'] }),
      });
      await synchroniser(prisma, robotLoyers, {
        fetchImpl: sourceLoyers({ ...LOYERS, 35238: ['Rennes', '16,00'] }),
      });
      const rennes = await ville('Rennes');
      const h15 = await prisma.historiqueValeur.findFirstOrThrow({
        where: { ligneId: String(rennes.id), champ: 'loyerM2Appartement', nouvelleValeur: '15' },
      });
      await expect(annulerModification(prisma, h15.id)).rejects.toThrow(/modifiée depuis/);
      expect(Number((await ville('Rennes')).loyerM2Appartement)).toBe(16);
      await expect(annulerModification(prisma, 999999)).rejects.toThrow(/introuvable/);
    });
  });

  function sourceLoyersCsv() {
    return sourceLoyers(LOYERS)('carte-des-loyers/pred-app-mef-dhup.csv');
  }
});
