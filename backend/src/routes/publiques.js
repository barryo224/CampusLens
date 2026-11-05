import { Router } from 'express';
import { z } from 'zod';
import { valider, codeSchema, idSchema, ErreurValidation } from '../lib/validation.js';
import { trouverAnnee, trouverProfil } from '../lib/contexte.js';
import { avecSource, serialiserSource, nombre } from '../lib/serialiser.js';

const CATEGORIES_AIDE = ['logement', 'etudes', 'urgence', 'alimentation'];

/**
 * Routes publiques : LECTURE SEULE (GET). Toute autre méthode tombe sur le 404 général.
 * Toutes les requêtes passent par Prisma (requêtes paramétrées, pas d'injection SQL).
 */
export function routesPubliques(prisma) {
  const r = Router();

  // GET /api/parametres?annee=en_cours
  r.get('/parametres', async (req, res) => {
    const { annee: anneeParam } = valider(
      z.object({
        annee: z
          .string()
          .max(20)
          .regex(/^(en_cours|\d{4}-\d{4})$/)
          .default('en_cours'),
      }),
      req.query,
    );
    const annee = await trouverAnnee(prisma, anneeParam);
    const lignes = await prisma.parametre.findMany({
      where: { anneeId: annee.id },
      include: { source: true, profil: true },
      orderBy: [{ cle: 'asc' }, { niveau: 'asc' }],
    });
    const maintenant = new Date();
    res.json({
      annee: { libelle: annee.libelle, enCours: annee.enCours },
      parametres: lignes.map((p) =>
        avecSource(
          {
            cle: p.cle,
            niveau: p.niveau,
            profil: p.profil?.code ?? null,
            valeur: nombre(p.valeur),
            unite: p.unite,
            verifieLe: p.verifieLe,
          },
          p.source,
          maintenant,
        ),
      ),
    });
  });

  // GET /api/aides?profil=&categorie=
  r.get('/aides', async (req, res) => {
    const {
      profil: codeProfil,
      categorie,
      miseEnAvant,
    } = valider(
      z.object({
        profil: codeSchema.optional(),
        categorie: z.enum(CATEGORIES_AIDE).optional(),
        miseEnAvant: z.enum(['true', 'false']).optional(),
      }),
      req.query,
    );
    const profil = codeProfil ? await trouverProfil(prisma, codeProfil) : null;

    const aides = await prisma.aide.findMany({
      where: {
        active: true,
        ...(categorie && { categorie }),
        ...(miseEnAvant && { miseEnAvant: miseEnAvant === 'true' }),
      },
      include: {
        source: true,
        eligibilites: {
          include: { profil: true },
          ...(profil && { where: { profilId: profil.id } }),
        },
      },
      orderBy: { id: 'asc' },
    });
    const maintenant = new Date();
    res.json(
      aides.map((a) => {
        const eligibilites = a.eligibilites.map((e) => ({
          profil: e.profil.code,
          statut: e.statut,
          precision: e.precision,
        }));
        return avecSource(
          {
            id: a.id,
            slug: a.slug,
            nom: a.nom,
            organisme: a.organisme,
            description: a.description,
            categorie: a.categorie,
            frequence: a.frequence,
            commentDemander: a.commentDemander,
            lienDemarche: a.lienDemarche,
            miseEnAvant: a.miseEnAvant,
            calculableOpenfisca: Boolean(a.codeOpenfisca),
            // Avec ?profil= : l'éligibilité de CE profil ; sinon les trois.
            ...(profil ? { eligibilite: eligibilites[0] ?? null } : { eligibilites }),
            verifieLe: a.verifieLe,
          },
          a.source,
          maintenant,
        );
      }),
    );
  });

  // GET /api/postes-rentree?profil=&situation=
  // Le budget de rentrée dépend du profil : droits et CVEC gratuits pour un boursier, droits différenciés et taxe de
  // visa pour un étudiant étranger qui arrive. Les montants liés à un paramètre sont lus dans les paramètres de l'année.
  r.get('/postes-rentree', async (req, res) => {
    const {
      profil: codeProfil,
      situation = 'arrivee',
      niveau = 'licence',
      exonere = 'non',
    } = valider(
      z.object({
        profil: codeSchema.optional(),
        situation: z.enum(['arrivee', 'sur_place']).optional(),
        niveau: z.enum(['licence', 'master']).optional(),
        exonere: z.enum(['oui', 'non']).optional(),
      }),
      req.query,
    );
    const profil = codeProfil ? await trouverProfil(prisma, codeProfil) : null;
    const annee = await trouverAnnee(prisma);
    const [postes, parametres] = await Promise.all([
      prisma.posteRentree.findMany({
        where: { anneeId: annee.id },
        include: {
          source: true,
          aide: {
            include: {
              eligibilites: {
                ...(profil && { where: { profilId: profil.id } }),
                include: { profil: true },
              },
            },
          },
        },
        orderBy: { montant: 'desc' },
      }),
      prisma.parametre.findMany({ where: { anneeId: annee.id }, include: { profil: true } }),
    ]);

    /**
     * Valeur d'un paramètre pour ce profil et ce niveau d'études. La valeur propre au profil prime sur la valeur
     * nationale, sauf pour les droits d'inscription d'un étudiant étranger exonéré (il paie le tarif national).
     */
    const valeurParametre = (cle) => {
      const candidats = parametres.filter(
        (p) => p.cle === cle && (p.niveau === niveau || p.niveau === 'aucun'),
      );
      const exactes = candidats.filter((p) => p.niveau === niveau);
      const pool = exactes.length > 0 ? exactes : candidats;
      const ignorerProfil = exonere === 'oui' && cle === 'droits_inscription';
      const propre = ignorerProfil ? null : pool.find((p) => p.profil?.code === codeProfil);
      const commun = pool.find((p) => !p.profilId);
      const retenu = propre ?? commun;
      return retenu ? Number(retenu.valeur) : null;
    };

    const visibles = postes.filter(
      (p) =>
        (!p.profilCode || p.profilCode === codeProfil) &&
        (!p.situation || p.situation === situation),
    );
    const calcules = visibles
      .map((p) => {
        const standard = p.parametreCle
          ? (valeurParametre(p.parametreCle) ?? Number(p.montant))
          : Number(p.montant);
        const offert = p.gratuitBoursier && codeProfil === 'boursier';
        return { p, montant: offert ? 0 : standard, offert, standard };
      })
      .sort((a, b) => b.montant - a.montant);

    const maintenant = new Date();
    res.json({
      annee: annee.libelle,
      profil: codeProfil ?? null,
      situation,
      niveau,
      exonere: exonere === 'oui',
      total: calcules.reduce((s, c) => s + c.montant, 0),
      postes: calcules.map(({ p, montant, offert, standard }) =>
        avecSource(
          {
            id: p.id,
            nom: p.nom,
            montant,
            // Ce que paierait un étudiant non boursier : pour afficher « offert avec votre bourse ».
            ...(offert && { montantSansBourse: standard }),
            offert,
            astuce: p.astuce,
            aide: p.aide
              ? {
                  slug: p.aide.slug,
                  nom: p.aide.nom,
                  eligibilites: p.aide.eligibilites.map((e) => ({
                    profil: e.profil.code,
                    statut: e.statut,
                    precision: e.precision,
                  })),
                }
              : null,
            verifieLe: p.verifieLe,
          },
          p.source,
          maintenant,
        ),
      ),
    });
  });

  // GET /api/villes
  r.get('/villes', async (_req, res) => {
    const villes = await prisma.ville.findMany({
      include: { source: true, tarifTransport: { include: { source: true } } },
      orderBy: { nom: 'asc' },
    });
    // Loyer le plus bas en résidence CROUS, par ville (les résidences sans tarif lisible sont ignorées).
    const loyersCrous = await prisma.logementCrous.groupBy({
      by: ['villeId'],
      _min: { loyerMin: true },
      where: { loyerMin: { not: null } },
    });
    const parVille = new Map(loyersCrous.map((l) => [l.villeId, nombre(l._min.loyerMin)]));
    const maintenant = new Date();
    res.json(
      villes.map((v) =>
        avecSource(
          {
            ...formaterVille(v),
            loyerCrousDesA: parVille.get(v.id) ?? null,
            ...formaterTransport(v.tarifTransport, maintenant),
          },
          v.source,
          maintenant,
        ),
      ),
    );
  });

  // GET /api/villes/:id
  r.get('/villes/:id', async (req, res) => {
    const id = valider(idSchema, req.params.id);
    const v = await prisma.ville.findUnique({
      where: { id },
      include: {
        source: true,
        logementsCrous: { include: { source: true } },
        associations: { include: { source: true } },
      },
    });
    if (!v) return res.status(404).json({ error: 'Ville introuvable.' });
    const maintenant = new Date();
    res.json({
      ...avecSource(formaterVille(v), v.source, maintenant),
      logementsCrous: v.logementsCrous.map((l) =>
        avecSource(
          {
            id: l.id,
            nomResidence: l.nomResidence,
            adresse: l.adresse,
            typeLogement: l.typeLogement,
            loyerMin: nombre(l.loyerMin),
            loyerMax: nombre(l.loyerMax),
            verifieLe: l.verifieLe,
          },
          l.source,
          maintenant,
        ),
      ),
      associations: v.associations.map((a) => formaterAssociation(a, maintenant)),
    });
  });

  // GET /api/associations?ville=
  r.get('/associations', async (req, res) => {
    const { ville } = valider(z.object({ ville: idSchema.optional() }), req.query);
    const associations = await prisma.association.findMany({
      // Avec ?ville= : celles de la ville + les nationales (ville vide).
      where: ville ? { OR: [{ villeId: ville }, { villeId: null }] } : {},
      include: { source: true },
      orderBy: { nom: 'asc' },
    });
    const maintenant = new Date();
    res.json(associations.map((a) => formaterAssociation(a, maintenant)));
  });

  // GET /api/ressources?categorie=&q=
  r.get('/ressources', async (req, res) => {
    const { categorie, q } = valider(
      z.object({
        categorie: codeSchema.optional(),
        q: z.string().trim().min(1).max(100).optional(),
      }),
      req.query,
    );
    // « % » et « _ » sont des jokers du LIKE de la base : on les échappe pour chercher exactement ce qui est tapé.
    const motif = q?.replace(/[\\%_]/g, '\\$&');
    const ressources = await prisma.ressource.findMany({
      where: {
        ...(categorie && { categorie }),
        ...(motif && {
          OR: [
            { titre: { contains: motif, mode: 'insensitive' } },
            { organisme: { contains: motif, mode: 'insensitive' } },
            { type: { contains: motif, mode: 'insensitive' } },
            { url: { contains: motif, mode: 'insensitive' } },
          ],
        }),
      },
      include: { source: true },
      orderBy: { id: 'asc' },
    });
    const maintenant = new Date();
    res.json(
      ressources.map((x) =>
        avecSource(
          {
            id: x.id,
            titre: x.titre,
            type: x.type,
            categorie: x.categorie,
            organisme: x.organisme,
            annee: x.annee,
            url: x.url,
            statutLien: x.statutLien, // ok | deplace | casse : la page Ressources le signale
            verifieLe: x.verifieLe,
          },
          x.source,
          maintenant,
        ),
      ),
    );
  });

  // GET /api/sources
  r.get('/sources', async (_req, res) => {
    const sources = await prisma.source.findMany({ orderBy: { id: 'asc' } });
    const maintenant = new Date();
    res.json(sources.map((s) => serialiserSource(s, maintenant)));
  });

  return r;
}

/** Abonnement de transport étudiant : montant annuel, équivalent mensuel et page officielle du réseau. */
function formaterTransport(t, maintenant) {
  if (!t) return { abonnementTransport: null, transport: null };
  const annuel = t.montantAnnuel === null ? null : nombre(t.montantAnnuel);
  return {
    // Le prix du pass mensuel s'il existe (c'est ce que paie un étudiant sans engagement), sinon l'annuel ÷ 12.
    abonnementTransport: t.montantMensuel
      ? nombre(t.montantMensuel)
      : annuel === null
        ? null
        : Math.round((annuel / 12) * 100) / 100,
    transport: avecSource(
      {
        reseau: t.reseau,
        libelle: t.libelle,
        typeTarif: t.typeTarif,
        montantAnnuel: annuel,
        montantMensuel: nombre(t.montantMensuel),
        conditions: t.conditions,
        urlTarifs: t.urlTarifs,
        verifieLe: t.verifieLe,
      },
      t.source,
      maintenant,
    ),
  };
}

function formaterVille(v) {
  return {
    id: v.id,
    codeInsee: v.codeInsee,
    nom: v.nom,
    region: v.region,
    codesPostaux: v.codesPostaux,
    loyerM2Appartement: nombre(v.loyerM2Appartement),
    loyerStudioEstime: nombre(v.loyerStudioEstime),
    nbLogementsCrous: v.nbLogementsCrous,
    abonnementTransport: nombre(v.abonnementTransport),
    verifieLe: v.verifieLe,
  };
}

function formaterAssociation(a, maintenant) {
  return avecSource(
    {
      id: a.id,
      nom: a.nom,
      description: a.description,
      lien: a.lien,
      villeId: a.villeId,
      verifieLe: a.verifieLe,
    },
    a.source,
    maintenant,
  );
}

export { ErreurValidation };
