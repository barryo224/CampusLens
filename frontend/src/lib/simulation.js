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
 * Lit un montant tel qu'une personne le tape OU le colle (relevé de banque, site, message) :
 * « 600 », « 12,5 », « 1 250,50 € », « 1.250,50 », « 1,250.50 », « 600 euros », « 1 200 » (espace insécable ou fine).
 * Renvoie `{ valeur, reconnu }` : `reconnu` est faux quand le texte n'est pas un montant (lettres, négatif…), pour que
 * l'écran puisse le dire au lieu de compter silencieusement 0 €. Un champ vide est « reconnu » et vaut 0.
 *
 * Séparateurs : si un point ET une virgule sont présents, le dernier est la décimale et l'autre sépare les milliers ;
 * avec un seul séparateur suivi d'exactement 3 chiffres (« 1.200 », « 1,200 »), c'est un séparateur de milliers (aucun
 * montant en euros n'a trois décimales) ; sinon c'est la décimale (« 12,5 », « 12.5 »).
 */
export function analyserMontant(brut) {
  if (typeof brut === 'number') {
    return {
      valeur: Number.isFinite(brut) && brut > 0 ? brut : 0,
      reconnu: Number.isFinite(brut) && brut >= 0,
    };
  }
  if (typeof brut !== 'string') return { valeur: 0, reconnu: true };
  let t = brut
    .trim()
    .replace(/\b(euros?|eur)\b/gi, '')
    .replace(/€/g, '')
    .replace(/[\s\u00a0\u202f']/g, '');
  if (t === '') return { valeur: 0, reconnu: true };
  if (!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return { valeur: 0, reconnu: false };
  const point = t.lastIndexOf('.');
  const virgule = t.lastIndexOf(',');
  let entier = t;
  let decimales = '';
  if (point >= 0 && virgule >= 0) {
    const sep = Math.max(point, virgule);
    entier = t.slice(0, sep).replace(/[.,]/g, '');
    decimales = t.slice(sep + 1);
  } else if (point >= 0 || virgule >= 0) {
    const caractere = point >= 0 ? '.' : ',';
    const morceaux = t.split(caractere);
    if (morceaux.length > 2) {
      if (!morceaux.slice(1).every((m) => m.length === 3)) return { valeur: 0, reconnu: false };
      entier = morceaux.join('');
    } else {
      const [avant, apres] = morceaux;
      if (apres.length === 3 && avant.length >= 1 && avant.length <= 3 && avant !== '0') {
        entier = avant + apres;
      } else {
        entier = avant;
        decimales = apres;
      }
    }
  }
  const n = Number(`${entier || '0'}${decimales ? `.${decimales}` : ''}`);
  if (!Number.isFinite(n)) return { valeur: 0, reconnu: false };
  // `ecrit` : le même montant écrit à la française (« 1250,50 »), sans € ni espaces : c'est ce que montre le bilan.
  return {
    valeur: n > 0 ? n : 0,
    reconnu: true,
    ecrit: `${entier || '0'}${decimales ? `,${decimales}` : ''}`,
  };
}

/** Convertit une saisie en nombre (voir `analyserMontant`). Vide, négatif, non numérique ou infini → 0. */
export function nombreSaisi(valeur) {
  return analyserMontant(valeur).valeur;
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
