import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { prismaTest, viderBase } from '../helpers/db.js';
import { seed } from '../../src/seed/index.js';
import { createApp } from '../../src/app.js';
import {
  construireRequete,
  periodeCourante,
  calculerAides,
  ErreurMoteur,
} from '../../src/openfisca/client.js';
import { reponse, fausseSource } from '../helpers/sources.js';

const MAINTENANT = new Date('2026-11-05T14:00:00Z');
const URL_API = '/api/simulation/aides-estimees';
const SAISIE = { age: 20, ville: '35238', loyer: 637, typeLogement: 'vide', revenu: 600 };

/** Réponse type d'OpenFisca : une famille avec les montants du mois. */
const reponseOpenfisca = ({
  aide = 199.88,
  apl = 0,
  als = 199.88,
  periode = '2026-11',
  status = 200,
  version = '175.0.45',
} = {}) =>
  reponse({
    status,
    texte: JSON.stringify({
      familles: {
        famille_0: {
          aide_logement: { [periode]: aide },
          apl: { [periode]: apl },
          als: { [periode]: als },
          parents: ['moi'],
        },
      },
    }),
    entetes: { 'country-package': 'openfisca-france', 'country-package-version': version },
  });

/** Faux OpenFisca qui mémorise ce qu'on lui envoie. */
function fauxOpenfisca(reponseFn = () => reponseOpenfisca()) {
  const recus = [];
  const f = async (url, options) => {
    recus.push({
      url: String(url),
      options,
      corps: options?.body ? JSON.parse(options.body) : null,
    });
    return reponseFn(url, options);
  };
  f.recus = recus;
  return f;
}

describe('POST /api/simulation/aides-estimees (relais OpenFisca)', () => {
  const prisma = prismaTest();
  beforeAll(() => viderBase(prisma));
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    await viderBase(prisma);
    await seed(prisma);
  });
  afterEach(() => vi.restoreAllMocks());

  const appAvec = (fetchImpl) => createApp({ prisma, fetchImpl, maintenant: () => MAINTENANT });

  it('OF-01 : envoie à OpenFisca uniquement les informations nécessaires, au bon format', async () => {
    const of = fauxOpenfisca();
    const res = await request(appAvec(of)).post(URL_API).send(SAISIE);
    expect(res.status).toBe(200);

    expect(of.recus).toHaveLength(1);
    const { url, options, corps } = of.recus[0];
    expect(url).toBe('https://api.fr.openfisca.org/latest/calculate');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(corps).toEqual({
      individus: {
        moi: {
          date_naissance: { ETERNITY: '2006-07-01' },
          activite: { '2026-11': 'etudiant' },
          salaire_imposable: { '2026-11': 600 },
        },
      },
      familles: {
        famille_0: {
          parents: ['moi'],
          aide_logement: { '2026-11': null },
          apl: { '2026-11': null },
          als: { '2026-11': null },
        },
      },
      foyers_fiscaux: { foyer_0: { declarants: ['moi'] } },
      menages: {
        menage_0: {
          personne_de_reference: ['moi'],
          loyer: { '2026-11': 637 },
          statut_occupation_logement: { '2026-11': 'locataire_vide' },
          depcom: { '2026-11': '35238' },
        },
      },
    });
  });

  it('renvoie le montant estimé avec sa source, la version du moteur et la date de calcul', async () => {
    const res = await request(appAvec(fauxOpenfisca())).post(URL_API).send(SAISIE);
    expect(res.body.periode).toBe('2026-11');
    expect(res.body.aides).toEqual([
      {
        slug: 'aide-logement-apl-als',
        nom: 'Aide au logement (APL / ALS)',
        codeOpenfisca: 'aide_logement',
        montantMensuel: 199.88,
        details: { apl: 0, als: 199.88 },
      },
    ]);
    expect(res.body.moteur).toEqual({ nom: 'OpenFisca France', version: '175.0.45' });
    expect(res.body.source).toMatchObject({ organisme: 'OpenFisca', statut: 'ok' });
    expect(res.body.verifieLe).toBe(MAINTENANT.toISOString());
    expect(res.body.aVerifier).toBe(false);
    expect(res.body.avertissement).toMatch(/ne remplace pas la simulation officielle de la CAF/);
    expect(res.headers['cache-control']).toBe('no-store'); // réponse liée à des données personnelles
  });

  it('les types de logement sont traduits dans le vocabulaire d’OpenFisca', async () => {
    for (const [type, attendu] of [
      ['vide', 'locataire_vide'],
      ['meuble', 'locataire_meuble'],
      ['foyer', 'locataire_foyer'],
    ]) {
      const of = fauxOpenfisca();
      await request(appAvec(of))
        .post(URL_API)
        .send({ ...SAISIE, typeLogement: type })
        .expect(200);
      expect(of.recus[0].corps.menages.menage_0.statut_occupation_logement['2026-11']).toBe(
        attendu,
      );
    }
  });

  it('le mois du calcul est celui de la date du jour (en UTC)', async () => {
    const of = fauxOpenfisca(() => reponseOpenfisca({ periode: '2027-01' }));
    const res = await request(
      createApp({ prisma, fetchImpl: of, maintenant: () => new Date('2027-01-31T23:59:00Z') }),
    )
      .post(URL_API)
      .send(SAISIE);
    expect(res.status).toBe(200);
    expect(res.body.periode).toBe('2027-01');
    expect(periodeCourante(new Date('2026-12-31T23:30:00Z'))).toBe('2026-12');
    expect(periodeCourante(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
  });

  describe('OF-02 : validation stricte des entrées (rien n’est envoyé à OpenFisca si invalide)', () => {
    const invalides = [
      ['âge trop bas', { age: 5 }],
      ['âge trop haut', { age: 150 }],
      ['âge décimal', { age: 20.5 }],
      ['âge en texte', { age: '20' }],
      ['loyer négatif', { loyer: -1 }],
      ['loyer absurde', { loyer: 99999 }],
      ['loyer en texte', { loyer: 'beaucoup' }],
      ['revenu négatif', { revenu: -50 }],
      ['revenu absurde', { revenu: 1e9 }],
      ['type de logement inconnu', { typeLogement: 'chateau' }],
      ['commune mal formée', { ville: 'abc' }],
      ['commune injection', { ville: "35238'; DROP TABLE ville;--" }],
      ['commune non suivie', { ville: '99999' }],
      ['champ en trop (nom)', { nom: 'Dupont' }],
      ['champ en trop (e-mail)', { email: 'a@b.fr' }],
      ['champ en trop (date exacte)', { dateNaissance: '2005-03-01' }],
    ];
    for (const [nom, modif] of invalides) {
      it(nom, async () => {
        const of = fauxOpenfisca();
        const res = await request(appAvec(of))
          .post(URL_API)
          .send({ ...SAISIE, ...modif });
        expect(res.status).toBe(400);
        expect(res.body.error).toBeTruthy();
        expect(of.recus).toHaveLength(0);
      });
    }
    it('champ manquant ou corps vide', async () => {
      const of = fauxOpenfisca();
      for (const corps of [{}, { age: 20 }, { ...SAISIE, revenu: undefined }]) {
        expect((await request(appAvec(of)).post(URL_API).send(corps)).status).toBe(400);
      }
      expect(of.recus).toHaveLength(0);
    });
    it('valeurs limites acceptées (loyer 0, revenu 0)', async () => {
      const res = await request(appAvec(fauxOpenfisca()))
        .post(URL_API)
        .send({ ...SAISIE, loyer: 0, revenu: 0, age: 15 });
      expect(res.status).toBe(200);
    });
  });

  describe('OF-03 : panne ou réponse inattendue du moteur → message clair, jamais de détail technique', () => {
    const verifierSur = (res, status) => {
      expect(res.status).toBe(status);
      expect(typeof res.body.error).toBe('string');
      const texte = JSON.stringify(res.body);
      expect(texte).not.toMatch(
        /stack|node_modules|openfisca-france|api\.fr|35238|637|motdepasse|Error:/i,
      );
    };

    it('réseau coupé ou délai dépassé → 503', async () => {
      const coupure = async () => {
        throw new Error('connexion refusée vers postgres://secret:motdepasse@interne');
      };
      verifierSur(await request(appAvec(coupure)).post(URL_API).send(SAISIE), 503);
      const delai = async () => {
        throw Object.assign(new Error('x'), { name: 'TimeoutError' });
      };
      verifierSur(await request(appAvec(delai)).post(URL_API).send(SAISIE), 503);
    });

    it('OpenFisca en erreur 5xx → 503 ; refus 4xx → 502', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      verifierSur(
        await request(
          appAvec(
            fauxOpenfisca(() => reponse({ status: 500, texte: '{"error":"loyer 637 refusé"}' })),
          ),
        )
          .post(URL_API)
          .send(SAISIE),
        503,
      );
      verifierSur(
        await request(appAvec(fauxOpenfisca(() => reponse({ status: 503 }))))
          .post(URL_API)
          .send(SAISIE),
        503,
      );
      verifierSur(
        await request(
          appAvec(
            fauxOpenfisca(() =>
              reponse({ status: 400, texte: '{"individus":{"moi":"valeur 600 invalide"}}' }),
            ),
          ),
        )
          .post(URL_API)
          .send(SAISIE),
        502,
      );
    });

    it('réponse mal formée, montant absurde ou période absente → 502', async () => {
      const cas = [
        reponse({ texte: 'pas du json' }),
        reponse({ texte: '{}' }),
        reponse({
          texte: JSON.stringify({
            familles: {
              famille_0: {
                aide_logement: { '2026-11': 'beaucoup' },
                apl: { '2026-11': 0 },
                als: { '2026-11': 0 },
              },
            },
          }),
        }),
        reponse({
          texte: JSON.stringify({
            familles: {
              famille_0: {
                aide_logement: { '2026-11': -5 },
                apl: { '2026-11': 0 },
                als: { '2026-11': 0 },
              },
            },
          }),
        }),
        reponse({
          texte: JSON.stringify({
            familles: {
              famille_0: {
                aide_logement: { '1999-01': 100 },
                apl: { '1999-01': 0 },
                als: { '1999-01': 0 },
              },
            },
          }),
        }),
        reponse({
          texte: JSON.stringify({
            familles: {
              famille_0: {
                aide_logement: { '2026-11': 99999999 },
                apl: { '2026-11': 0 },
                als: { '2026-11': 0 },
              },
            },
          }),
        }),
      ];
      for (const c of cas)
        verifierSur(
          await request(appAvec(fauxOpenfisca(() => c)))
            .post(URL_API)
            .send(SAISIE),
          502,
        );
    });

    it('la source passe en « erreur » puis revient à « ok » quand le moteur répond de nouveau', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const statut = async () =>
        (await prisma.source.findUniqueOrThrow({ where: { cle: 'openfisca' } })).statut;
      await request(appAvec(fauxOpenfisca(() => reponse({ status: 500 }))))
        .post(URL_API)
        .send(SAISIE)
        .expect(503);
      expect(await statut()).toBe('erreur');
      await request(appAvec(fauxOpenfisca())).post(URL_API).send(SAISIE).expect(200);
      expect(await statut()).toBe('ok');
      const s = await prisma.source.findUniqueOrThrow({ where: { cle: 'openfisca' } });
      expect(s.dernierControle.getTime()).toBe(MAINTENANT.getTime());
    });
  });

  describe('OF-04 : rien n’est enregistré ni journalisé', () => {
    const compter = async () =>
      Object.fromEntries(
        await Promise.all(
          [
            'messageContact',
            'historiqueValeur',
            'synchronisation',
            'changementDetecte',
            'ville',
            'parametre',
            'aide',
            'ressource',
            'administrateur',
            'sessionAdmin',
          ].map(async (t) => [t, await prisma[t].count()]),
        ),
      );

    it('aucune ligne n’est créée ni modifiée en base (seul l’état de la source est mis à jour)', async () => {
      const avant = await compter();
      const villesAvant = JSON.stringify(await prisma.ville.findMany({ orderBy: { id: 'asc' } }));
      await request(appAvec(fauxOpenfisca())).post(URL_API).send(SAISIE).expect(200);
      expect(await compter()).toEqual(avant);
      expect(JSON.stringify(await prisma.ville.findMany({ orderBy: { id: 'asc' } }))).toBe(
        villesAvant,
      );
    });

    it('aucune saisie n’apparaît dans les journaux du serveur (succès comme échec)', async () => {
      const espions = ['log', 'info', 'warn', 'error', 'debug'].map((m) =>
        vi.spyOn(console, m).mockImplementation(() => {}),
      );
      await request(appAvec(fauxOpenfisca())).post(URL_API).send(SAISIE).expect(200);
      await request(
        appAvec(fauxOpenfisca(() => reponse({ status: 500, texte: '{"x":"loyer 637"}' }))),
      )
        .post(URL_API)
        .send(SAISIE)
        .expect(503);
      await request(
        appAvec(fauxOpenfisca(() => reponse({ status: 400, texte: '{"x":"revenu 600"}' }))),
      )
        .post(URL_API)
        .send(SAISIE)
        .expect(502);
      await request(
        appAvec(() => {
          throw new Error('coupure');
        }),
      )
        .post(URL_API)
        .send(SAISIE)
        .expect(503);
      const tout = JSON.stringify(espions.flatMap((e) => e.mock.calls));
      for (const donnee of ['637', '600', '35238', '2006', 'locataire'])
        expect(tout, donnee).not.toContain(donnee);
    });
  });

  it('OF-05 : limite de 10 estimations par minute et par IP (429 ensuite)', async () => {
    const app = appAvec(fauxOpenfisca());
    for (let i = 0; i < 10; i++)
      expect((await request(app).post(URL_API).send(SAISIE)).status).toBe(200);
    const onzieme = await request(app).post(URL_API).send(SAISIE);
    expect(onzieme.status).toBe(429);
    expect(onzieme.body.error).toMatch(/Trop de demandes/);
  });

  it('OF-06 : seule la méthode POST existe (GET, PUT, DELETE → 404)', async () => {
    const app = appAvec(fauxOpenfisca());
    for (const m of ['get', 'put', 'delete', 'patch'])
      expect((await request(app)[m](URL_API).send(SAISIE)).status).toBe(404);
  });

  it('OF-07 : sans aide à calculer (aucune aide active avec un code OpenFisca), on n’appelle pas le moteur', async () => {
    await prisma.aide.updateMany({ data: { active: false } });
    const of = fauxOpenfisca();
    const res = await request(appAvec(of)).post(URL_API).send(SAISIE);
    expect(res.status).toBe(200);
    expect(res.body.aides).toEqual([]);
    expect(of.recus).toHaveLength(0);
  });

  it('OF-08 : le montant 0 est renvoyé tel quel (« aucune aide estimée »), arrondi au centime', async () => {
    const res = await request(appAvec(fauxOpenfisca(() => reponseOpenfisca({ aide: 0, als: 0 }))))
      .post(URL_API)
      .send(SAISIE);
    expect(res.body.aides[0].montantMensuel).toBe(0);
    const arrondi = await request(
      appAvec(fauxOpenfisca(() => reponseOpenfisca({ aide: 123.456789, als: 123.456789 }))),
    )
      .post(URL_API)
      .send(SAISIE);
    expect(arrondi.body.aides[0].montantMensuel).toBe(123.46);
  });

  it('OF-09 : l’adresse d’OpenFisca est configurable (instance auto-hébergée)', async () => {
    const of = fauxOpenfisca();
    await request(
      createApp({
        prisma,
        fetchImpl: of,
        maintenant: () => MAINTENANT,
        urlOpenfisca: 'https://openfisca.interne.test/api',
      }),
    )
      .post(URL_API)
      .send(SAISIE)
      .expect(200);
    expect(of.recus[0].url).toBe('https://openfisca.interne.test/api/calculate');
  });

  describe('client OpenFisca', () => {
    it('construireRequete : plusieurs aides → leurs variables et détails sont demandés ; date de naissance approchée', () => {
      const r = construireRequete(SAISIE, '2026-11', ['aide_logement'], MAINTENANT);
      expect(Object.keys(r.familles.famille_0)).toEqual(['parents', 'aide_logement', 'apl', 'als']);
      expect(r.individus.moi.date_naissance.ETERNITY).toBe('2006-07-01'); // jamais une date exacte
    });
    it('calculerAides lève ErreurMoteur (message sûr) en cas de panne', async () => {
      await expect(
        calculerAides(SAISIE, ['aide_logement'], {
          fetchImpl: fausseSource({}),
          maintenant: MAINTENANT,
        }),
      ).rejects.toBeInstanceOf(ErreurMoteur);
    });
  });
});
