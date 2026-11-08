import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { prismaTest, viderBase } from '../helpers/db.js';
import { seed } from '../../src/seed/index.js';
import { createApp } from '../../src/app.js';
import { synchroniser } from '../../src/sync/moteur.js';
import { ROBOTS } from '../../src/sync/robots/index.js';
import {
  fausseSource,
  reponse,
  sourceLoyers,
  sourceCrous,
  residence,
  pageHtml,
  pageDroits,
  pageCvec,
} from '../helpers/sources.js';

const MDP = 'un-mot-de-passe-solide-2026';

/** Toutes les mentions « vérification en cours » que le site public afficherait, avec l'endroit où on les voit. */
async function mentionsEnCours(app) {
  const trouvees = [];
  const lire = async (chemin) => (await request(app).get(chemin)).body;
  const noter = (page, nom, o) => o?.aVerifier && trouvees.push(`${page} : ${nom}`);

  for (const a of await lire('/api/aides')) noter('Aides', a.nom, a);
  for (const p of (await lire('/api/parametres')).parametres)
    noter('Paramètres', `${p.cle} ${p.niveau} ${p.profil ?? ''}`, p);
  for (const profil of ['fr_ue', 'boursier', 'intl'])
    for (const situation of ['arrivee', 'sur_place'])
      for (const p of (await lire(`/api/postes-rentree?profil=${profil}&situation=${situation}`))
        .postes)
        noter(`Budget (${profil})`, p.nom, p);
  const villes = await lire('/api/villes');
  for (const v of villes) {
    noter('Villes', `${v.nom} (loyer)`, v);
    if (v.transport) noter('Villes', `${v.nom} (transport ${v.transport.reseau})`, v.transport);
  }
  for (const r of await lire('/api/ressources')) noter('Ressources', r.titre, r);
  for (const a of await lire('/api/associations')) noter('Associations', a.nom, a);
  const rennes = villes.find((v) => v.nom === 'Rennes');
  const detail = await lire(`/api/villes/${rennes.id}`);
  for (const l of detail.logementsCrous ?? []) noter('Résidences Crous', l.nomResidence, l);
  return trouvees;
}

describe('Parcours d’administration COMPLET : plus rien ne reste bloqué en « vérification en cours »', () => {
  const prisma = prismaTest();
  let app;
  let admin;
  beforeAll(async () => {
    await viderBase(prisma);
    await seed(prisma);
    await prisma.administrateur.create({
      data: { email: 'a@test.fr', motDePasseHash: bcrypt.hashSync(MDP, 4), role: 'admin' },
    });
    app = createApp({ prisma });
    admin = request.agent(app);
    await admin.post('/api/admin/login').send({ email: 'a@test.fr', motDePasse: MDP }).expect(200);
  });
  afterAll(() => prisma.$disconnect());

  it('départ : la base neuve affiche bien des mentions « vérification en cours » partout', async () => {
    const avant = await mentionsEnCours(app);
    expect(avant.length).toBeGreaterThan(100);
  });

  it('chaque donnée en cours est soit mise à jour par un robot, soit présentée dans « Données à vérifier »', async () => {
    // 1. Les robots qui lisent des données (loyers, Crous, liens, droits, CVEC) s'exécutent.
    const villes = await prisma.ville.findMany();
    const loyers = Object.fromEntries(villes.map((v) => [v.codeInsee, [v.nom, '15,00']]));
    await synchroniser(prisma, ROBOTS.loyers, { fetchImpl: sourceLoyers(loyers) });
    await synchroniser(prisma, ROBOTS.logements_crous, {
      fetchImpl: sourceCrous([residence(1, 'Villejean', 'Rennes', 'Chambre : 280 €')]),
    });
    await synchroniser(prisma, ROBOTS.liens_ressources, {
      fetchImpl: fausseSource({ '': (u) => reponse({ status: 200, url: u }) }),
    });
    await synchroniser(prisma, ROBOTS.droits, {
      fetchImpl: fausseSource({ 'actualites/A14725': () => pageHtml(pageDroits()) }),
    });
    await synchroniser(prisma, ROBOTS.cvec, {
      fetchImpl: fausseSource({ 'cvec.etudiant.gouv.fr': () => pageHtml(pageCvec()) }),
    });

    // 2. Droits et CVEC : le robot propose, l'administrateur valide dans « À valider ».
    const aValider = (await admin.get('/api/admin/changements')).body;
    expect(aValider.length).toBeGreaterThanOrEqual(2);
    for (const c of aValider) {
      const valeurs = c.suggestions.map((s) => ({ parametreId: s.parametreId, valeur: s.valeur }));
      await admin.post(`/api/admin/changements/${c.id}/valider`).send({ valeurs }).expect(200);
    }

    // 3. Tout le reste : l'administrateur le vérifie, source par source, comme avec le bouton de l'écran.
    const items = (await admin.get('/api/admin/verification')).body;
    expect(items.length).toBeGreaterThan(0);
    const sources = [...new Set(items.map((i) => i.source.id))];
    for (const id of sources) await admin.post(`/api/admin/verification/source/${id}`).expect(200);
    expect((await admin.get('/api/admin/verification')).body).toEqual([]); // la liste est vide

    // 4. Le site public n'affiche plus AUCUNE mention « vérification en cours ».
    const restantes = await mentionsEnCours(app);
    expect(restantes, `Données impossibles à valider :\n${restantes.join('\n')}`).toEqual([]);
  });

  it('toute source sans robot dit à l’administrateur de la vérifier à la main, et lancer un robot absent est expliqué', async () => {
    const sources = (await admin.get('/api/admin/sources')).body;
    const sansRobot = sources.filter((s) => !s.robot);
    expect(sansRobot.length).toBeGreaterThan(5);
    expect(sansRobot.every((s) => s.verificationManuelle === true)).toBe(true);
    // Les sources à simple veille se vérifient aussi à la main (le robot ne fait que surveiller la page).
    const veille = sources.filter((s) => s.veille);
    expect(veille.length).toBeGreaterThan(30);
    expect(veille.every((s) => s.robot && s.verificationManuelle)).toBe(true);
    // Seuls droits, CVEC, loyers, Crous et liens sont de vrais robots de données.
    const vraisRobots = sources.filter((s) => s.robot && !s.veille);
    expect(vraisRobots.map((s) => s.cle).sort()).toEqual(
      ['cvec', 'droits', 'liens_ressources', 'logements_crous', 'loyers'].sort(),
    );
    expect(vraisRobots.every((s) => s.verificationManuelle === false)).toBe(true);

    const res = await admin.post(`/api/admin/sources/${sansRobot[0].id}/synchroniser`);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/pas de robot.*Données à vérifier/);
  });

  it('plus aucune source orpheline : chaque source de la liste porte au moins une donnée ou un robot', async () => {
    const sources = await prisma.source.findMany({
      include: {
        _count: {
          select: {
            parametres: true,
            aides: true,
            postesRentree: true,
            villes: true,
            logementsCrous: true,
            tarifsTransport: true,
            associations: true,
            ressources: true,
          },
        },
      },
    });
    const orphelines = sources.filter(
      (s) => !s.cle && Object.values(s._count).every((n) => n === 0),
    );
    expect(orphelines.map((s) => s.nom)).toEqual([]);
  });
});
