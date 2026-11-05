// Réponses d'API de test (même forme que le vrai backend).
const source = { id: 1, nom: 'Fiches', organisme: 'DILA', statut: 'ok', aVerifier: false };

export const AIDES_ACCUEIL = [
  {
    slug: 'bourse',
    nom: 'Bourse sur critères sociaux',
    description: 'Une aide mensuelle.',
    categorie: 'etudes',
    miseEnAvant: true,
    source,
    verifieLe: null,
    aVerifier: true,
  },
  {
    slug: 'apl',
    nom: 'Aide au logement (APL / ALS)',
    description: 'La CAF prend en charge une partie du loyer.',
    categorie: 'logement',
    miseEnAvant: true,
    source,
    verifieLe: null,
    aVerifier: true,
  },
  {
    slug: 'visale',
    nom: 'Garantie Visale',
    description: 'Pas de garant ? Visale se porte caution.',
    categorie: 'logement',
    miseEnAvant: true,
    source,
    verifieLe: null,
    aVerifier: true,
  },
  {
    slug: 'urgence',
    nom: 'Aide d’urgence',
    description: 'Un coup dur ? Le CROUS peut vous aider.',
    categorie: 'urgence',
    miseEnAvant: true,
    source,
    verifieLe: null,
    aVerifier: true,
  },
];

// ───── Paramètres (fixture du cahier : droits 178/254, intl 2 902/3 950, CVEC 105, seuil 150) ─────
const srcDroits = { id: 10, organisme: 'Service-Public.fr', statut: 'ok' };
const p = (cle, niveau, profil, valeur, unite = '€ / an') => ({
  cle,
  niveau,
  profil,
  valeur,
  unite,
  source: srcDroits,
  verifieLe: null,
  aVerifier: true,
});
export const PARAMETRES_API = {
  annee: { libelle: '2026-2027', enCours: true },
  parametres: [
    p('droits_inscription', 'licence', null, 178),
    p('droits_inscription', 'master', null, 254),
    p('droits_inscription', 'licence', 'intl', 2902),
    p('droits_inscription', 'master', 'intl', 3950),
    p('cvec', 'aucun', null, 105),
    p('seuil_fragile', 'aucun', null, 150, '€'),
    p('seuil_part_loyer', 'aucun', null, 40, '%'),
    p('heures_travail_max', 'aucun', 'intl', 964, 'heures / an'),
    p('ressources_mensuelles_visa', 'aucun', 'intl', 877.5, '€ / mois'),
  ],
};

// ───── Aides avec éligibilité par profil ─────
const e = (statut, precision) => ({ statut, precision });
const AIDES = [
  {
    slug: 'bourse',
    nom: 'Bourse sur critères sociaux',
    organisme: 'CROUS',
    categorie: 'etudes',
    description: 'Une aide mensuelle selon vos ressources.',
    commentDemander: 'Remplissez votre Dossier social étudiant (DSE).',
    lienDemarche: 'https://www.messervices.etudiant.gouv.fr',
    miseEnAvant: true,
    elig: {
      fr_ue: e('sous_conditions', 'Selon vos ressources'),
      boursier: e('oui', 'Vous en bénéficiez'),
      intl: e('sous_conditions', 'Selon votre situation'),
    },
  },
  {
    slug: 'apl',
    nom: 'Aide au logement (APL / ALS)',
    organisme: 'CAF',
    categorie: 'logement',
    description: 'La CAF verse une partie de votre loyer.',
    commentDemander: 'Demande en ligne sur caf.fr.',
    lienDemarche: null,
    miseEnAvant: true,
    elig: {
      fr_ue: e('oui', 'Vous y avez droit'),
      boursier: e('oui', 'Vous y avez droit'),
      intl: e('sous_conditions', 'Titre de séjour valide'),
    },
  },
  {
    slug: 'visale',
    nom: 'Garantie Visale',
    organisme: 'Action Logement',
    categorie: 'logement',
    description: 'Une caution gratuite.',
    commentDemander: 'Créez votre visa sur visale.fr.',
    lienDemarche: null,
    miseEnAvant: true,
    elig: {
      fr_ue: e('oui', 'Vous y avez droit'),
      boursier: e('oui', 'Vous y avez droit'),
      intl: e('oui', 'Vous y avez droit'),
    },
  },
  {
    slug: 'urgence',
    nom: 'Aide spécifique ponctuelle',
    organisme: 'CROUS',
    categorie: 'urgence',
    description: 'Une aide en cas de coup dur.',
    commentDemander: 'Rendez-vous avec une assistante sociale.',
    lienDemarche: null,
    miseEnAvant: true,
    elig: {
      fr_ue: e('oui', 'Sur dossier'),
      boursier: e('oui', 'Sur dossier'),
      intl: e('sous_conditions', 'Sur dossier'),
    },
  },
  {
    slug: 'exo',
    nom: 'Exonération des droits d’inscription',
    organisme: 'Votre université',
    categorie: 'etudes',
    description: 'Retour au tarif national.',
    commentDemander: 'Demande auprès de votre université.',
    lienDemarche: null,
    miseEnAvant: false,
    elig: {
      fr_ue: e('non', 'Non concerné'),
      boursier: e('non', 'Non concerné'),
      intl: e('sous_conditions', 'Selon votre université'),
    },
  },
];

/** Réponse de GET /api/aides?profil=&categorie=&miseEnAvant= (même forme que le backend). */
export function reponseAides(chemin) {
  const q = new URLSearchParams(chemin.split('?')[1] ?? '');
  const profil = q.get('profil');
  return AIDES.filter((a) => !q.get('categorie') || a.categorie === q.get('categorie'))
    .filter((a) => q.get('miseEnAvant') !== 'true' || a.miseEnAvant)
    .map(({ elig, ...a }) => ({
      ...a,
      source,
      verifieLe: null,
      aVerifier: true,
      ...(profil
        ? { eligibilite: { profil, ...elig[profil] } }
        : { eligibilites: Object.entries(elig).map(([pr, v]) => ({ profil: pr, ...v })) }),
    }));
}

export const POSTES_API = {
  annee: '2026-2027',
  total: 2095,
  postes: [
    {
      id: 1,
      nom: 'Dépôt de garantie',
      montant: 637,
      astuce: 'Avance Loca-Pass ou FSL',
      aide: {
        slug: 'avance-loca-pass',
        nom: 'Avance Loca-Pass',
        eligibilites: [{ profil: 'fr_ue', statut: 'sous_conditions', precision: 'Salarié' }],
      },
      source: { id: 3, organisme: 'FAGE' },
      verifieLe: null,
      aVerifier: true,
    },
    {
      id: 2,
      nom: 'Matériel pédagogique',
      montant: 502,
      astuce: 'Aide ponctuelle du CROUS si besoin',
      aide: {
        slug: 'aide-specifique-ponctuelle',
        nom: 'Aide spécifique ponctuelle',
        eligibilites: [{ profil: 'fr_ue', statut: 'oui', precision: 'Sur dossier' }],
      },
      source: { id: 3, organisme: 'FAGE' },
      verifieLe: null,
      aVerifier: true,
    },
    {
      id: 3,
      nom: 'CVEC',
      montant: 105,
      astuce: 'Offerte si vous êtes boursier',
      aide: null,
      source: { id: 3, organisme: 'FAGE' },
      verifieLe: null,
      aVerifier: true,
    },
  ],
};

export const RESSOURCES_API = [
  {
    id: 1,
    titre: 'Demander une caution Visale',
    type: 'Démarche en ligne',
    categorie: 'aides',
    organisme: 'visale.fr',
    annee: '2026',
    url: 'https://www.visale.fr',
    statutLien: 'ok',
    source,
    verifieLe: null,
    aVerifier: true,
  },
  {
    id: 2,
    titre: 'Indicateur du coût de la rentrée',
    type: 'Dossier de presse',
    categorie: 'cout_de_la_vie',
    organisme: 'FAGE',
    annee: '2026',
    url: 'https://www.fage.org',
    statutLien: 'ok',
    source,
    verifieLe: '2026-09-01T00:00:00Z',
    aVerifier: false,
  },
  {
    id: 3,
    titre: 'Ancien guide supprimé',
    type: 'Rapport',
    categorie: 'effectifs',
    organisme: 'SIES',
    annee: null,
    url: 'https://exemple.test/mort',
    statutLien: 'casse',
    source,
    verifieLe: null,
    aVerifier: true,
  },
];
