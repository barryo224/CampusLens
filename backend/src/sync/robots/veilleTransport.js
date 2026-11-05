import { z } from 'zod';
import { telecharger, ErreurSource } from '../http.js';
import { texteDepuisHtml } from '../outils.js';

/**
 * Veille d'une page de tarifs d'un réseau de transport.
 *
 * Les réseaux changent leurs prix à des dates très variables (1er juillet, 1er août, 1er septembre, 1er janvier…) :
 * la page est donc relue chaque jour. On ne compare ni le texte (les actualités et les « titres similaires » du réseau
 * changent tout le temps) ni tous les montants de la page : on surveille UNIQUEMENT nos prix. La signature est la liste
 * des prix que nous avons enregistrés (mensuel, annuel) qui figurent encore sur la page.
 *
 * Quand un réseau change un tarif, notre ancien prix disparaît de la page : la signature change, les tarifs du réseau
 * repassent en « vérification en cours » et une alerte apparaît dans « À valider » (voir moteur.js, `veilleVerification`).
 */

const MIN_CARACTERES = 300; // en dessous : page vide, d'erreur ou chargée par JavaScript, donc illisible

/** Montants en euros écrits dans le texte, normalisés (« 28 € », « 19,95 € », « 1 200 euros »). */
export function montantsAffiches(texte) {
  const trouves = new Set();
  for (const m of String(texte).matchAll(
    /(\d{1,3}(?:[  ]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(?:€|euros?\b)/gi,
  )) {
    const entier = m[1].replace(/[\s ]/g, '');
    trouves.add(m[2] ? `${Number(entier)}.${m[2].padEnd(2, '0')}` : String(Number(entier)));
  }
  return [...trouves].sort((a, b) => Number(a) - Number(b));
}

/** Un montant enregistré (16, 169.6, 19.95) sous la forme normalisée de `montantsAffiches`. */
const normaliser = (n) => (Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(2));

export function creerVeilleTransport(cle) {
  return {
    cle,
    niveau: 3,
    veilleVerification: true,

    async telecharger({ source, fetchImpl, prisma }) {
      const reponse = await telecharger(source.url, { fetchImpl });
      const texte = texteDepuisHtml(reponse.texte);
      if (texte.length < MIN_CARACTERES)
        throw new ErreurSource('Page vide ou illisible (contenu chargé par script ?) : ignorée.');
      if (/^Erreur \d{3}|Page not found|provisoirement indisponible/im.test(texte.slice(0, 300)))
        throw new ErreurSource('La page affiche une erreur : contenu ignoré.');
      const montants = montantsAffiches(texte);
      if (montants.length === 0)
        throw new ErreurSource('Aucun montant lisible sur la page : ignorée.');

      const presents = new Set(montants);
      const tarifs = await prisma.tarifTransport.findMany({ where: { sourceId: source.id } });
      const attendus = [
        ...new Set(
          tarifs
            .flatMap((t) => [t.montantMensuel, t.montantAnnuel])
            .filter((v) => v !== null && v !== undefined)
            .map(normaliser),
        ),
      ].sort((a, b) => Number(a) - Number(b));
      const ici = attendus.filter((a) => presents.has(a));
      const absents = attendus.filter((a) => !presents.has(a));
      return { contenu: `presents:${ici.join(';')}|absents:${absents.join(';')}` };
    },

    async analyser({ contenu }) {
      return { signature: z.string().min(10).parse(contenu) };
    },

    async proposer({ source, donnees }) {
      const absents = donnees.signature.split('|absents:')[1];
      return {
        resume: `La page « ${source.nom} » a changé : ${
          absents
            ? `le ou les prix enregistrés (${absents.split(';').join(' €, ')} €) n’y figurent plus`
            : 'un prix enregistré, absent jusqu’ici, y figure maintenant'
        }. Le réseau a peut-être modifié ses tarifs : comparez et corrigez-les si besoin.`,
        suggestions: [],
      };
    },
  };
}

/** Réseaux dont la page affiche lisiblement les prix (relevé du 5 novembre 2026) : clé du robot → clé de la source. */
export const RESEAUX_SURVEILLES = [
  'transportBrest',
  'transportDijon',
  'transportPau',
  'transportLeHavre',
  'transportGrenoble',
  'transportAjaccio',
  'transportNantes',
  'transportQuimper',
  'transportMarseille',
  'transportRennes',
  'transportSaintEtienne',
  'transportLimoges',
  'transportPerpignan',
  'transportLeMans',
  'transportMulhouse',
  'transportNancy',
  'transportChambery',
  'transportClermont',
  'transportLyon',
  'transportSaintBrieuc',
  'transportNimes',
  'transportToulouse',
  'transportCaen',
  'transportLaRochelle',
  'transportAngers',
];

export const cleRobotTransport = (source) =>
  `veille_${source
    .replace(/^transport/, 'transport_')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()}`;

export const ROBOTS_TRANSPORT = Object.fromEntries(
  RESEAUX_SURVEILLES.map((s) => [cleRobotTransport(s), creerVeilleTransport(cleRobotTransport(s))]),
);
