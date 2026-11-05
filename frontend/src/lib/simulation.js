/**
 * Simulateur CampusLens : calcul du reste-à-vivre mensuel.
 *
 * Fonction PURE : mêmes entrées → mêmes sorties, aucun accès réseau, aucun stockage.
 * Le calcul se fait dans le navigateur : rien n'est envoyé ni enregistré (RGPD).
 *
 * AUCUN montant ni seuil n'est écrit ici : droits d'inscription, CVEC et seuil de
 * fragilité viennent de `parametres` (réponse de GET /api/parametres, année en cours).
 */

export const CHAMPS_REVENUS = ['job', 'famille', 'bourse', 'aideLogement'];
export const CHAMPS_DEPENSES = [
  'loyer',
  'alimentation',
  'transport',
  'telephone',
  'sante',
  'autres',
];

const STATUTS = ['fr_ue', 'intl'];
const NIVEAUX = ['licence', 'master'];

/**
 * Convertit une saisie en nombre. Vide, négatif, non numérique ou infini → 0.
 * Accepte la virgule française : « 12,5 » vaut 12.5.
 */
export function nombreSaisi(valeur) {
  if (typeof valeur === 'number') {
    return Number.isFinite(valeur) && valeur > 0 ? valeur : 0;
  }
  if (typeof valeur !== 'string') return 0;
  const texte = valeur.trim().replace(/\s/g, '').replace(',', '.');
  if (texte === '' || !/^\d*\.?\d*$/.test(texte)) return 0;
  const n = Number(texte);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Cherche un paramètre du plus précis au plus général :
 * (clé, niveau, profil) → (clé, niveau) → (clé, profil) → (clé).
 * Lève une erreur claire s'il manque : on ne devine JAMAIS un montant.
 */
export function trouverParametre(parametres, cle, { niveau = 'aucun', profil = null } = {}) {
  const candidats = [
    [niveau, profil],
    [niveau, null],
    ['aucun', profil],
    ['aucun', null],
  ];
  for (const [n, p] of candidats) {
    const ligne = parametres?.find(
      (x) => x.cle === cle && x.niveau === n && (x.profil ?? null) === p,
    );
    if (ligne) return Number(ligne.valeur);
  }
  throw new Error(`Paramètre manquant : ${cle}`);
}

/** Arrondit à 2 décimales (centimes), sans « -0 ». */
function arrondir(n) {
  const r = (Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;
  return r === 0 ? 0 : r;
}

/** Somme de montants en centimes entiers : évite les erreurs de virgule flottante (0,1 + 0,2). */
const enCentimes = (n) => Math.round(n * 100);

function sommeCentimes(saisie, champs) {
  return champs.reduce((total, champ) => total + enCentimes(nombreSaisi(saisie?.[champ])), 0);
}

/**
 * @param {{statut: 'fr_ue'|'intl', niveau: 'licence'|'master', boursier?: boolean, exonere?: boolean}} profil
 * @param {Object} saisie  revenus (job, famille, bourse, aideLogement) et dépenses
 *                         (loyer, alimentation, transport, telephone, sante, autres)
 * @param {Array} parametres  [{cle, niveau, profil, valeur}] de l'année universitaire en cours
 * @returns {{
 *   totalRevenus: number, totalDepenses: number, droitsInscription: number, cvec: number,
 *   fraisMensuels: number, resteAVivre: number, niveau: 'en_difficulte'|'fragile'|'equilibre',
 *   libelleNiveau: string, partLoyer: number|null
 * }}
 */
export function calculerResteAVivre(profil, saisie, parametres) {
  if (!STATUTS.includes(profil?.statut)) throw new Error(`Statut inconnu : ${profil?.statut}`);
  if (!NIVEAUX.includes(profil?.niveau))
    throw new Error(`Niveau d'études inconnu : ${profil?.niveau}`);

  const { statut, niveau } = profil;

  // Règles de l'énoncé :
  //  - boursier (prioritaire, même si « international » est choisi) → droits = 0 et CVEC = 0 ;
  //  - international non exonéré → droits différenciés du profil intl ;
  //  - sinon → droits nationaux.
  let droits;
  let cvec;
  let tarif; // quel tarif a été appliqué : sert à l'expliquer clairement à l'étudiant
  if (profil.boursier) {
    tarif = 'boursier';
    droits = 0;
    cvec = 0;
  } else {
    const profilDroits = statut === 'intl' && !profil.exonere ? 'intl' : null;
    if (statut !== 'intl') tarif = 'national';
    else tarif = profil.exonere ? 'international_exonere' : 'international';
    droits = trouverParametre(parametres, 'droits_inscription', { niveau, profil: profilDroits });
    cvec = trouverParametre(parametres, 'cvec');
  }
  const seuilFragile = trouverParametre(parametres, 'seuil_fragile');

  // Étudiant étranger : ressources demandées pour le visa et le titre de séjour (si le paramètre est connu).
  // On compare avec ce que l'étudiant déclare, hors aide au logement (qui n'est pas une ressource de l'étudiant).
  let ressourcesVisa = null;
  if (statut === 'intl') {
    try {
      const exigees = trouverParametre(parametres, 'ressources_mensuelles_visa', {
        profil: 'intl',
      });
      const declareesC = sommeCentimes(saisie, ['job', 'famille', 'bourse']);
      ressourcesVisa = {
        exigees,
        declarees: declareesC / 100,
        suffisantes: declareesC >= enCentimes(exigees),
      };
    } catch {
      ressourcesVisa = null; // paramètre absent : on n'invente pas de seuil
    }
  }

  const revenusC = sommeCentimes(saisie, CHAMPS_REVENUS);
  const depensesC = sommeCentimes(saisie, CHAMPS_DEPENSES);
  const fraisC = (enCentimes(droits) + enCentimes(cvec)) / 12; // droits + CVEC lissés sur 12 mois

  const resteAVivre = arrondir((revenusC - depensesC - fraisC) / 100);

  let niveauSituation;
  if (resteAVivre < 0) niveauSituation = 'en_difficulte';
  else if (resteAVivre < seuilFragile) niveauSituation = 'fragile';
  else niveauSituation = 'equilibre';

  const loyer = nombreSaisi(saisie?.loyer);
  const totalRevenus = revenusC / 100;

  return {
    totalRevenus,
    totalDepenses: depensesC / 100,
    droitsInscription: droits,
    cvec,
    fraisMensuels: arrondir(fraisC / 100),
    resteAVivre,
    niveau: niveauSituation,
    libelleNiveau: LIBELLES_NIVEAU[niveauSituation],
    tarif,
    ressourcesVisa,
    // Part du loyer dans les revenus (sert aux recommandations) ; null si aucun revenu.
    partLoyer: totalRevenus > 0 ? loyer / totalRevenus : null,
  };
}

export const LIBELLES_NIVEAU = {
  en_difficulte: 'en difficulté',
  fragile: 'fragile',
  equilibre: 'équilibré',
};

/** Nom du tarif d'inscription appliqué (affiché sous le résultat et dans le bilan PDF). */
export const LIBELLES_TARIF = {
  national: 'Tarif national',
  international: 'Tarif étudiant international (droits différenciés)',
  international_exonere: 'Exonération des droits différenciés : tarif national',
  boursier: 'Boursier : droits d’inscription et CVEC offerts',
};
