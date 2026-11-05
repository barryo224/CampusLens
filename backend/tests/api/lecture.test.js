import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { creerContexte } from '../helpers/app.js';

describe('API publique : lecture', () => {
  let prisma;
  let app;

  beforeAll(async () => {
    ({ prisma, app } = await creerContexte());
  });
  afterAll(() => prisma.$disconnect());

  it('API-01 : GET /api/aides?profil=intl renvoie l’éligibilité du profil intl pour chaque aide', async () => {
    const res = await request(app).get('/api/aides?profil=intl');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(8);
    for (const aide of res.body) {
      expect(aide.eligibilite.profil).toBe('intl');
      expect(['oui', 'sous_conditions', 'non']).toContain(aide.eligibilite.statut);
    }
    const exo = res.body.find((a) => a.slug === 'exoneration-droits-inscription');
    expect(exo.eligibilite.statut).toBe('sous_conditions');
  });

  it('API-01 bis : sans profil, les 3 éligibilités sont renvoyées ; le filtre catégorie marche', async () => {
    const tous = await request(app).get('/api/aides');
    expect(tous.body[0].eligibilites).toHaveLength(3);
    const logement = await request(app).get('/api/aides?categorie=logement');
    expect(logement.body.length).toBeGreaterThan(0);
    expect(logement.body.every((a) => a.categorie === 'logement')).toBe(true);
  });

  it('API-01 ter : ?miseEnAvant=true ne renvoie que les aides mises en avant (accueil)', async () => {
    const res = await request(app).get('/api/aides?miseEnAvant=true');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(4);
    expect(res.body.every((a) => a.miseEnAvant)).toBe(true);
    expect((await request(app).get('/api/aides?miseEnAvant=peut-etre')).status).toBe(400);
  });

  it('API-02 : profil inconnu → 400 avec message clair', async () => {
    const res = await request(app).get('/api/aides?profil=inconnu');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/profil inconnu/i);
  });

  it('API-03 : /api/parametres?annee=en_cours ne renvoie que l’année en cours', async () => {
    const source = await prisma.source.findFirstOrThrow();
    const autre = await prisma.anneeUniversitaire.create({
      data: {
        libelle: '2025-2026',
        dateDebut: new Date('2025-09-01'),
        dateFin: new Date('2026-08-31'),
        enCours: false,
      },
    });
    await prisma.parametre.create({
      data: {
        cle: 'cvec',
        niveau: 'aucun',
        anneeId: autre.id,
        valeur: 100,
        unite: '€ / an',
        sourceId: source.id,
      },
    });

    const res = await request(app).get('/api/parametres?annee=en_cours');
    expect(res.status).toBe(200);
    expect(res.body.annee).toEqual({ libelle: '2026-2027', enCours: true });
    const cvec = res.body.parametres.filter((p) => p.cle === 'cvec');
    expect(cvec).toHaveLength(1);
    expect(cvec[0].valeur).toBe(105);

    // Sans paramètre : « en cours » par défaut. Avec un libellé : cette année-là.
    const defaut = await request(app).get('/api/parametres');
    expect(defaut.body.annee.libelle).toBe('2026-2027');
    const ancienne = await request(app).get('/api/parametres?annee=2025-2026');
    expect(ancienne.body.parametres).toHaveLength(1);
    expect(ancienne.body.parametres[0].valeur).toBe(100);
  });

  it('API-03 bis : année invalide ou inexistante → 400', async () => {
    expect((await request(app).get('/api/parametres?annee=abc')).status).toBe(400);
    expect((await request(app).get('/api/parametres?annee=1999-2000')).status).toBe(400);
  });

  it('API-04 : une aide désactivée (active = false) est absente des résultats', async () => {
    await prisma.aide.update({ where: { slug: 'garantie-visale' }, data: { active: false } });
    const res = await request(app).get('/api/aides?profil=fr_ue');
    expect(res.body.map((a) => a.slug)).not.toContain('garantie-visale');
    await prisma.aide.update({ where: { slug: 'garantie-visale' }, data: { active: true } });
  });

  it('API-05 : /api/ressources?q=visale ne renvoie que les ressources correspondantes', async () => {
    const res = await request(app).get('/api/ressources?q=visale');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].titre).toMatch(/visale/i);
    const tout = await request(app).get('/api/ressources');
    expect(tout.body.length).toBeGreaterThan(1);
    const vide = await request(app).get('/api/ressources?q=zzzintrouvable');
    expect(vide.body).toEqual([]);
  });

  it('API-06 : chaque objet renvoyé contient source et verifieLe', async () => {
    const source = await prisma.source.findFirstOrThrow();
    const ville = await prisma.ville.findFirstOrThrow({ where: { nom: 'Paris' } });
    await prisma.logementCrous.create({
      data: { villeId: ville.id, nomResidence: 'Résidence test', sourceId: source.id },
    });

    const listes = [
      '/api/aides?profil=fr_ue',
      '/api/aides',
      '/api/ressources',
      '/api/associations',
      '/api/villes',
    ];
    for (const url of listes) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(200);
      expect(res.body.length, url).toBeGreaterThan(0);
      for (const o of res.body) {
        expect(o.source, url).toBeTruthy();
        expect(o, url).toHaveProperty('verifieLe');
        expect(o, url).toHaveProperty('aVerifier');
      }
    }
    const params = await request(app).get('/api/parametres');
    for (const o of params.body.parametres) {
      expect(o.source).toBeTruthy();
      expect(o).toHaveProperty('verifieLe');
    }
    const postes = await request(app).get('/api/postes-rentree?profil=boursier');
    expect(postes.body.postes.length).toBe(7);
    expect(postes.body.total).toBe(1812); // boursier : droits (178 €) et CVEC (105 €) offerts
    for (const o of postes.body.postes) {
      expect(o.source).toBeTruthy();
      expect(o).toHaveProperty('verifieLe');
    }
    const detail = await request(app).get(`/api/villes/${ville.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.source).toBeTruthy();
    expect(detail.body.logementsCrous[0].source).toBeTruthy();
    const sources = await request(app).get('/api/sources');
    expect(sources.body.length).toBeGreaterThan(0);
    expect(sources.body[0]).not.toHaveProperty('empreinte'); // donnée interne, jamais publique
  });

  it('API-06 bis : « à vérifier » tant que la donnée n’a pas été vérifiée par une source à jour', async () => {
    const EDITORIAUX = ['seuil_fragile', 'seuil_part_loyer', 'surface_studio_m2']; // choix de CampusLens : validés par l'éditeur
    const avant = await request(app).get('/api/parametres');
    // Les valeurs issues de sources externes sont « à vérifier » ; les choix éditoriaux de CampusLens ne le sont pas.
    expect(
      avant.body.parametres.filter((p) => !EDITORIAUX.includes(p.cle)).every((p) => p.aVerifier),
    ).toBe(true);
    expect(
      avant.body.parametres.filter((p) => EDITORIAUX.includes(p.cle)).every((p) => !p.aVerifier),
    ).toBe(true);

    const maintenant = new Date();
    await prisma.source.updateMany({ data: { statut: 'ok', dernierControle: maintenant } });
    await prisma.parametre.updateMany({ where: { cle: 'cvec' }, data: { verifieLe: maintenant } });
    const apres = await request(app).get('/api/parametres');
    expect(apres.body.parametres.find((p) => p.cle === 'cvec').aVerifier).toBe(false);
    expect(apres.body.parametres.find((p) => p.cle === 'heures_travail_max').aVerifier).toBe(true); // jamais vérifiée

    // Délai de vérification dépassé : la source redevient « à vérifier ».
    const trèsVieux = new Date(Date.now() - 24 * 3_600_000 * 365);
    await prisma.source.updateMany({ data: { dernierControle: trèsVieux } });
    const perime = await request(app).get('/api/parametres');
    expect(perime.body.parametres.find((p) => p.cle === 'cvec').aVerifier).toBe(true);
    // Les réglages éditoriaux ne « périment » pas (délai de plusieurs années).
    expect(perime.body.parametres.find((p) => p.cle === 'seuil_fragile').aVerifier).toBe(false);
  });

  it('/api/postes-rentree : le budget de rentrée dépend du profil et de la situation', async () => {
    const budget = async (q) => (await request(app).get(`/api/postes-rentree?${q}`)).body;
    const poste = (b, nom) => b.postes.find((p) => p.nom === nom);

    const fr = await budget('profil=fr_ue');
    expect(fr.total).toBe(2095);
    expect(fr.postes).toHaveLength(7); // pas de taxe de visa pour un Français
    expect(poste(fr, 'Droits d’inscription').montant).toBe(178);

    const bourse = await budget('profil=boursier');
    expect(bourse.total).toBe(2095 - 178 - 105);
    expect(poste(bourse, 'Droits d’inscription')).toMatchObject({
      montant: 0,
      offert: true,
      montantSansBourse: 178,
    });
    expect(poste(bourse, 'CVEC')).toMatchObject({ montant: 0, offert: true });
    expect(poste(bourse, 'Dépôt de garantie').offert).toBe(false); // seuls droits et CVEC sont offerts

    const arrivee = await budget('profil=intl');
    expect(poste(arrivee, 'Droits d’inscription').montant).toBe(2902); // tarif différencié, lu dans les paramètres
    expect(poste(arrivee, 'Taxe de validation du visa (VLS-TS)').montant).toBe(100);
    expect(arrivee.total).toBe(2095 - 178 + 2902 + 100);
    expect(arrivee.situation).toBe('arrivee');

    const surPlace = await budget('profil=intl&situation=sur_place');
    expect(poste(surPlace, 'Taxe de validation du visa (VLS-TS)')).toBeUndefined(); // déjà en France : pas de VLS-TS
    expect(surPlace.total).toBe(2095 - 178 + 2902);

    // Master : droits plus élevés (255 € national, 3 950 € différencié).
    const master = await budget('profil=fr_ue&niveau=master');
    expect(poste(master, 'Droits d’inscription').montant).toBe(255);
    expect(master.total).toBe(2095 - 178 + 255);
    const masterIntl = await budget('profil=intl&niveau=master');
    expect(poste(masterIntl, 'Droits d’inscription').montant).toBe(3950);

    // Étudiant étranger exonéré : tarif national, mais la taxe de visa reste due à l'arrivée.
    const exonere = await budget('profil=intl&exonere=oui');
    expect(poste(exonere, 'Droits d’inscription').montant).toBe(178);
    expect(poste(exonere, 'Taxe de validation du visa (VLS-TS)').montant).toBe(100);
    expect(exonere.total).toBe(2095 + 100);
    expect(exonere.exonere).toBe(true);
    expect((await budget('profil=intl&exonere=oui&niveau=master')).total).toBe(
      2095 - 178 + 255 + 100,
    );
    // « exonéré » ne change rien pour un Français.
    expect((await budget('profil=fr_ue&exonere=oui')).total).toBe(2095);

    expect(new Set([fr.total, bourse.total, arrivee.total, exonere.total]).size).toBe(4);
    expect((await request(app).get('/api/postes-rentree?niveau=doctorat')).status).toBe(400);
    expect((await request(app).get('/api/postes-rentree?situation=nimporte')).status).toBe(400);

    // Les ressources à justifier pour le visa sont un paramètre vérifiable comme les autres.
    const params = (await request(app).get('/api/parametres')).body.parametres;
    const ressources = params.find((p) => p.cle === 'ressources_mensuelles_visa');
    expect(ressources).toMatchObject({ valeur: 877.5, profil: 'intl' });
    expect(ressources.source.organisme).toBe('Service-Public.fr');
  });

  it('/api/villes : abonnement de transport = pass mensuel s’il existe, sinon annuel ÷ 12, avec sa source', async () => {
    const villes = (await request(app).get('/api/villes')).body;
    const parNom = (nom) => villes.find((v) => v.nom === nom);
    expect(parNom('Toulouse').abonnementTransport).toBe(16); // pass 31 jours, pas 169,60 ÷ 12
    expect(parNom('Toulouse').transport.montantAnnuel).toBe(169.6);
    expect(parNom('Paris').abonnementTransport).toBe(33.44); // annuel ÷ 12 (pas de pass mensuel)
    expect(parNom('Nancy').abonnementTransport).toBe(22); // mensuel seulement
    expect(parNom('Nancy').transport.montantAnnuel).toBeNull();
    expect(parNom('Toulouse').transport.source).toBeTruthy();
    expect(parNom('Toulouse').transport.aVerifier).toBe(true); // jamais vérifié à la main
    expect(parNom('Bastia').transport).toBeNull(); // pas encore relevé : jamais de chiffre inventé
    expect(parNom('Bastia').abonnementTransport).toBeNull();
    // Même réseau, même tarif : toute l'Île-de-France est couverte par l'Imagine R.
    expect(parNom('Nanterre').abonnementTransport).toBe(33.44);
    expect(parNom('Villeurbanne').abonnementTransport).toBe(26); // réseau TCL de Lyon
    expect(villes.filter((v) => v.transport).length).toBeGreaterThanOrEqual(60);
  });

  it('/api/villes/:id : inconnue → 404, invalide → 400', async () => {
    expect((await request(app).get('/api/villes/999999')).status).toBe(404);
    expect((await request(app).get('/api/villes/abc')).status).toBe(400);
  });

  it('API-10 : une injection dans un paramètre → 400, aucune fuite de données', async () => {
    const injection = encodeURIComponent("' OR 1=1 --");
    for (const url of [
      `/api/aides?profil=${injection}`,
      `/api/aides?categorie=${injection}`,
      `/api/postes-rentree?profil=${injection}`,
      `/api/ressources?categorie=${injection}`,
      `/api/associations?ville=${injection}`,
      '/api/villes/1%20OR%201=1',
    ]) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(400);
      expect(res.body.error).toBeTruthy();
      expect(Array.isArray(res.body)).toBe(false);
    }
    // Dans une recherche libre, la requête est paramétrée : le texte est cherché tel quel.
    const q = await request(app).get(`/api/ressources?q=${injection}`);
    expect(q.status).toBe(200);
    expect(q.body).toEqual([]);
  });

  it('API-11 : PUT, DELETE, PATCH et POST sur une route publique → 404', async () => {
    const avant = await prisma.aide.count();
    for (const methode of ['put', 'delete', 'patch', 'post']) {
      for (const url of ['/api/aides', '/api/parametres', '/api/ressources', '/api/villes/1']) {
        const res = await request(app)[methode](url).send({ nom: 'pirate' });
        expect([404, 405], `${methode} ${url}`).toContain(res.status);
      }
    }
    expect(await prisma.aide.count()).toBe(avant);
  });

  it('envoie les en-têtes de sécurité et n’annonce pas Express', async () => {
    const res = await request(app).get('/api/aides');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('CORS : seule l’origine du site est autorisée', async () => {
    const ok = await request(app).get('/api/aides').set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const ko = await request(app).get('/api/aides').set('Origin', 'http://pirate.example');
    expect(ko.headers['access-control-allow-origin']).toBeUndefined();
  });
});
