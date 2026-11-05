import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { valider, ErreurValidation } from '../lib/validation.js';
import { serialiserSource } from '../lib/serialiser.js';
import {
  calculerAides,
  periodeCourante,
  TYPES_LOGEMENT,
  VARIABLES_CALCULABLES,
  URL_OPENFISCA_PAR_DEFAUT,
} from '../openfisca/client.js';

// Liste FERMÉE de champs (.strict) : tout champ en plus est refusé, pour qu'aucune autre donnée
// personnelle ne puisse transiter par ce relais. Les bornes sont des garde-fous contre les saisies absurdes.
const entreeSchema = z
  .object({
    age: z.number().int().min(15).max(99),
    ville: z.string().regex(/^[0-9][0-9AB][0-9]{3}$/, 'code commune invalide'),
    loyer: z.number().finite().min(0).max(5000),
    typeLogement: z.enum(Object.keys(TYPES_LOGEMENT)),
    revenu: z.number().finite().min(0).max(10_000),
  })
  .strict();

/**
 * POST /api/simulation/aides-estimees — relais vers OpenFisca (niveau 2 : « calcul à la source »).
 * Aucune donnée de la requête n'est enregistrée, journalisée ni mise en cache.
 * Facultatif : le site ne l'appelle que si l'étudiant clique sur « Estimer mon aide ».
 */
export function routeSimulation(
  prisma,
  {
    fetchImpl = fetch,
    maintenant = () => new Date(),
    urlOpenfisca = URL_OPENFISCA_PAR_DEFAUT,
  } = {},
) {
  const r = Router();

  const limite = rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Trop de demandes d’estimation. Réessayez dans une minute.' },
  });

  r.post('/simulation/aides-estimees', limite, async (req, res) => {
    // La réponse dépend de données personnelles : aucun navigateur ni proxy ne doit la garder.
    res.set('Cache-Control', 'no-store');
    const entree = valider(entreeSchema, req.body);

    // La commune doit être une de celles que CampusLens suit (liste issue de la base).
    const ville = await prisma.ville.findUnique({ where: { codeInsee: entree.ville } });
    if (!ville) throw new ErreurValidation('Commune non prise en charge pour l’estimation.');

    // Les aides à calculer sont celles de la base qui portent un code OpenFisca (et que l'on sait calculer).
    const aides = (
      await prisma.aide.findMany({
        where: { active: true, codeOpenfisca: { not: null } },
        orderBy: { id: 'asc' },
      })
    ).filter((a) => VARIABLES_CALCULABLES[a.codeOpenfisca]);
    const source = await prisma.source.findUnique({ where: { cle: 'openfisca' } });
    const now = maintenant();
    const moteur = { nom: 'OpenFisca France', version: null };
    const avertissement =
      'Estimation indicative calculée avec les règles en vigueur. Elle ne remplace pas la simulation officielle de la CAF.';

    // Aucune aide à calculer : on n'envoie rien au moteur.
    if (aides.length === 0) {
      return res.json({
        periode: periodeCourante(now),
        aides: [],
        moteur,
        source: serialiserSource(source, now),
        verifieLe: null,
        aVerifier: true,
        avertissement,
      });
    }

    let calcul;
    try {
      calcul = await calculerAides(entree, [...new Set(aides.map((a) => a.codeOpenfisca))], {
        fetchImpl,
        baseUrl: urlOpenfisca,
        maintenant: now,
      });
    } catch (e) {
      if (source)
        await prisma.source.update({ where: { id: source.id }, data: { statut: 'erreur' } });
      throw e;
    }
    if (source)
      await prisma.source.update({
        where: { id: source.id },
        data: { statut: 'ok', dernierControle: now },
      });
    const sourceAJour = source ? { ...source, statut: 'ok', dernierControle: now } : null;

    res.json({
      periode: calcul.periode,
      aides: aides.map((a) => ({
        slug: a.slug,
        nom: a.nom,
        codeOpenfisca: a.codeOpenfisca,
        montantMensuel: calcul.montants[a.codeOpenfisca],
        details: Object.fromEntries(
          VARIABLES_CALCULABLES[a.codeOpenfisca].details.map((d) => [d, calcul.details[d]]),
        ),
      })),
      moteur: { ...moteur, version: calcul.version },
      source: serialiserSource(sourceAJour, now),
      verifieLe: now.toISOString(),
      aVerifier: false,
      avertissement,
    });
  });

  return r;
}
