import { z } from 'zod';

export const URL_OPENFISCA_PAR_DEFAUT = 'https://api.fr.openfisca.org/latest';

/** Erreur « le moteur de calcul est indisponible » : message sûr, sans détail technique. */
export class ErreurMoteur extends Error {
  constructor(
    message = 'Le moteur de calcul des aides est momentanément indisponible. Réessayez plus tard.',
    status = 503,
  ) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

// Statut d'occupation du logement : valeurs du formulaire → valeurs d'OpenFisca France.
export const TYPES_LOGEMENT = {
  vide: 'locataire_vide',
  meuble: 'locataire_meuble',
  foyer: 'locataire_foyer',
};

/**
 * Variables OpenFisca que l'on accepte de calculer (liste fermée : on n'envoie jamais un nom venu de l'extérieur).
 * Les aides concernées sont celles de la base qui ont un `code_openfisca` ; ce tableau dit seulement
 * à quelle entité OpenFisca chaque variable appartient et quels détails on lit en plus.
 */
export const VARIABLES_CALCULABLES = {
  aide_logement: { entite: 'familles', details: ['apl', 'als'] },
};

/** « 2026-11 » : le mois en cours (OpenFisca calcule mois par mois). */
export const periodeCourante = (maintenant = new Date()) =>
  `${maintenant.getUTCFullYear()}-${String(maintenant.getUTCMonth() + 1).padStart(2, '0')}`;

/**
 * Construit la requête OpenFisca à partir des SEULES informations nécessaires :
 * âge, commune, loyer, type de logement, revenu du mois. Rien d'autre n'est transmis.
 */
export function construireRequete(
  { age, ville, loyer, typeLogement, revenu },
  periode,
  codes,
  maintenant = new Date(),
) {
  const annee = maintenant.getUTCFullYear() - age;
  const famille = { parents: ['moi'] };
  for (const code of codes) {
    famille[code] = { [periode]: null }; // « null » = « calcule cette valeur »
    for (const detail of VARIABLES_CALCULABLES[code].details) famille[detail] = { [periode]: null };
  }
  return {
    individus: {
      moi: {
        // Date de naissance approchée (milieu d'année) : on ne demande jamais la date exacte.
        date_naissance: { ETERNITY: `${annee}-07-01` },
        activite: { [periode]: 'etudiant' },
        salaire_imposable: { [periode]: revenu },
      },
    },
    familles: { famille_0: famille },
    foyers_fiscaux: { foyer_0: { declarants: ['moi'] } },
    menages: {
      menage_0: {
        personne_de_reference: ['moi'],
        loyer: { [periode]: loyer },
        statut_occupation_logement: { [periode]: TYPES_LOGEMENT[typeLogement] },
        depcom: { [periode]: ville },
      },
    },
  };
}

const arrondir2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const montantSchema = (periode) =>
  z.object({ [periode]: z.number().finite().nonnegative().max(10_000) });

/**
 * Interroge OpenFisca. Ne mémorise, ne journalise et ne met en cache AUCUNE donnée de la requête.
 * @returns {{ montants: Record<string, number>, details: Record<string, number>, version: string|null, periode: string }}
 */
export async function calculerAides(
  entree,
  codes,
  {
    fetchImpl = fetch,
    baseUrl = URL_OPENFISCA_PAR_DEFAUT,
    maintenant = new Date(),
    delaiMs = 20_000,
  } = {},
) {
  const periode = periodeCourante(maintenant);
  const corps = construireRequete(entree, periode, codes, maintenant);

  let reponse;
  try {
    reponse = await fetchImpl(`${baseUrl}/calculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'CampusLens/1.0 (estimation facultative)',
      },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(delaiMs),
    });
  } catch {
    throw new ErreurMoteur(); // réseau coupé ou délai dépassé : message générique
  }
  if (!reponse.ok) {
    // On ne lit PAS le corps de l'erreur : il peut répéter les informations envoyées.
    console.error(`[openfisca] réponse ${reponse.status}`);
    throw new ErreurMoteur(
      reponse.status >= 500 ? undefined : 'Le moteur de calcul n’a pas pu traiter cette situation.',
      reponse.status >= 500 ? 503 : 502,
    );
  }

  const forme = {};
  for (const code of codes) {
    forme[code] = montantSchema(periode);
    for (const d of VARIABLES_CALCULABLES[code].details) forme[d] = montantSchema(periode);
  }
  let famille;
  try {
    const json = JSON.parse(await reponse.text());
    famille = z
      .object({ familles: z.object({ famille_0: z.object(forme).passthrough() }) })
      .parse(json).familles.famille_0;
  } catch {
    throw new ErreurMoteur('Réponse inattendue du moteur de calcul.', 502);
  }

  const montants = {};
  const details = {};
  for (const code of codes) {
    montants[code] = arrondir2(famille[code][periode]);
    for (const d of VARIABLES_CALCULABLES[code].details)
      details[d] = arrondir2(famille[d][periode]);
  }
  return {
    montants,
    details,
    version: reponse.headers?.get?.('country-package-version') ?? null,
    periode,
  };
}
