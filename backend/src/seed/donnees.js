// Données de DÉPART uniquement. Dès qu'un robot de synchronisation (phase 6) ou un
// administrateur met une valeur à jour, la base fait foi et le seed ne l'écrase jamais.
// Toutes ces lignes ont verifieLe = null : le site les affichera « à vérifier »
// tant qu'une source officielle ne les a pas confirmées.

export const ANNEE = {
  libelle: '2026-2027',
  dateDebut: new Date('2026-09-01'),
  dateFin: new Date('2027-08-31'),
  enCours: true,
};

export const PROFILS = [
  { code: 'fr_ue', libelle: 'Étudiant français ou européen' },
  { code: 'boursier', libelle: 'Étudiant boursier' },
  { code: 'intl', libelle: 'Étudiant international hors UE' },
];

// Clé = identifiant interne utilisé plus bas dans les paramètres, aides et postes.
// `cle` (facultative) relie la source à son robot de synchronisation (backend/src/sync/).
// `anciensNoms` : noms d'une version précédente du seed, pour corriger les lignes déjà créées.
// Adresses vérifiées le 5 novembre 2026 (une source sans robot reste « à vérifier »).
export const SOURCES = {
  droits: {
    cle: 'droits',
    nom: 'Droits d’inscription nationaux (Service-Public)',
    anciensNoms: ['Droits d’inscription différenciés'],
    organisme: 'Service-Public.fr',
    url: 'https://www.service-public.fr/particuliers/actualites/A14725',
    type: 'page_web',
    frequenceHeures: 24 * 7,
  },
  cvec: {
    cle: 'cvec',
    nom: 'Contribution de vie étudiante et de campus (CVEC)',
    organisme: 'CVEC — étudiant.gouv.fr',
    anciensNoms: ['Contribution de vie étudiante et de campus (CVEC)'],
    url: 'https://cvec.etudiant.gouv.fr',
    type: 'page_web',
    frequenceHeures: 24 * 7,
  },
  fage: {
    // Pas de robot : l'adresse du dossier de presse annuel est à fournir (voir README).
    nom: 'Indicateur du coût de la rentrée',
    organisme: 'FAGE',
    url: 'https://www.fage.org',
    type: 'pdf',
    frequenceHeures: 24 * 30,
  },
  reglages: {
    nom: 'Réglages de calcul CampusLens',
    organisme: 'CampusLens',
    url: 'https://github.com/',
    type: 'page_web',
    frequenceHeures: 24 * 90,
  },
  fiches: {
    nom: 'Fiches pratiques Service-Public',
    organisme: 'DILA',
    url: 'https://www.data.gouv.fr/',
    type: 'jeu_ouvert',
    frequenceHeures: 24,
    licence: 'Licence Ouverte 2.0',
  },
  associations: {
    nom: 'Sites des associations d’entraide',
    organisme: 'Associations',
    url: 'https://www.agoraes.fr',
    type: 'page_web',
    frequenceHeures: 24 * 7,
  },
  ressources: {
    cle: 'liens_ressources',
    nom: 'Pages officielles des démarches',
    organisme: 'Organismes publics',
    url: 'https://www.messervices.etudiant.gouv.fr',
    type: 'page_web',
    frequenceHeures: 24 * 7,
  },
  loyers: {
    cle: 'loyers',
    nom: 'Carte des loyers (indicateurs de loyers d’annonce par commune)',
    organisme: 'Ministère du Logement — ANIL',
    url: 'https://www.data.gouv.fr/api/1/datasets/',
    type: 'jeu_ouvert',
    frequenceHeures: 24 * 7,
    licence: 'Licence Ouverte 2.0',
  },
  openfisca: {
    cle: 'openfisca',
    nom: 'Calcul des aides (OpenFisca France)',
    organisme: 'OpenFisca',
    url: 'https://api.fr.openfisca.org/latest',
    type: 'moteur_calcul',
    frequenceHeures: 24,
    licence: 'AGPL-3.0',
  },
  logementsCrous: {
    cle: 'logements_crous',
    nom: 'Logements proposés par les CROUS',
    organisme: 'CNOUS',
    url: 'https://data.enseignementsup-recherche.gouv.fr/api/explore/v2.1/catalog/datasets/fr_crous_logement_france_entiere',
    type: 'jeu_ouvert',
    frequenceHeures: 24 * 7,
    licence: 'Licence Ouverte 2.0',
  },
};

// Villes étudiantes suivies (code INSEE vérifié dans la carte des loyers 2025).
// Paris, Lyon et Marseille n'apparaissent dans ce fichier que par arrondissement : leur loyer
// reste vide (« — ») tant qu'on ne les agrège pas. Le robot remplit les valeurs ; on ne les écrit jamais ici.
export const VILLES = [
  ['75056', 'Paris', 'Île-de-France'],
  ['69123', 'Lyon', 'Auvergne-Rhône-Alpes'],
  ['13055', 'Marseille', 'Provence-Alpes-Côte d’Azur'],
  ['31555', 'Toulouse', 'Occitanie'],
  ['59350', 'Lille', 'Hauts-de-France'],
  ['33063', 'Bordeaux', 'Nouvelle-Aquitaine'],
  ['44109', 'Nantes', 'Pays de la Loire'],
  ['67482', 'Strasbourg', 'Grand Est'],
  ['34172', 'Montpellier', 'Occitanie'],
  ['35238', 'Rennes', 'Bretagne'],
  ['38185', 'Grenoble', 'Auvergne-Rhône-Alpes'],
  ['06088', 'Nice', 'Provence-Alpes-Côte d’Azur'],
  ['21231', 'Dijon', 'Bourgogne-Franche-Comté'],
  ['49007', 'Angers', 'Pays de la Loire'],
  ['51454', 'Reims', 'Grand Est'],
  ['63113', 'Clermont-Ferrand', 'Auvergne-Rhône-Alpes'],
  ['37261', 'Tours', 'Centre-Val de Loire'],
  ['14118', 'Caen', 'Normandie'],
  ['76540', 'Rouen', 'Normandie'],
  ['54395', 'Nancy', 'Grand Est'],
  ['57463', 'Metz', 'Grand Est'],
  ['86194', 'Poitiers', 'Nouvelle-Aquitaine'],
  ['87085', 'Limoges', 'Nouvelle-Aquitaine'],
  ['45234', 'Orléans', 'Centre-Val de Loire'],
  ['25056', 'Besançon', 'Bourgogne-Franche-Comté'],
  ['80021', 'Amiens', 'Hauts-de-France'],
  ['29019', 'Brest', 'Bretagne'],
  ['66136', 'Perpignan', 'Occitanie'],
  ['64445', 'Pau', 'Nouvelle-Aquitaine'],
  ['42218', 'Saint-Étienne', 'Auvergne-Rhône-Alpes'],
].map(([codeInsee, nom, region]) => ({ codeInsee, nom, region }));

// profil: null = valeur nationale (tous les profils). niveau: 'aucun' si indépendant du niveau.
export const PARAMETRES = [
  {
    cle: 'droits_inscription',
    niveau: 'licence',
    profil: null,
    valeur: 178,
    unite: '€ / an',
    source: 'droits',
  },
  {
    cle: 'droits_inscription',
    niveau: 'master',
    profil: null,
    valeur: 255,
    unite: '€ / an',
    source: 'droits',
  },
  {
    cle: 'droits_inscription',
    niveau: 'licence',
    profil: 'intl',
    valeur: 2902,
    unite: '€ / an',
    source: 'droits',
  },
  {
    cle: 'droits_inscription',
    niveau: 'master',
    profil: 'intl',
    valeur: 3950,
    unite: '€ / an',
    source: 'droits',
  },
  { cle: 'cvec', niveau: 'aucun', profil: null, valeur: 105, unite: '€ / an', source: 'cvec' },
  {
    cle: 'seuil_fragile',
    niveau: 'aucun',
    profil: null,
    valeur: 150,
    unite: '€',
    source: 'reglages',
  },
  // Surface type d'un studio, pour estimer son loyer (loyer au m² × surface).
  {
    cle: 'surface_studio_m2',
    niveau: 'aucun',
    profil: null,
    valeur: 20,
    unite: 'm²',
    source: 'reglages',
  },
  // Part du loyer dans les revenus (en %) au-delà de laquelle on recommande de comparer les villes.
  {
    cle: 'seuil_part_loyer',
    niveau: 'aucun',
    profil: null,
    valeur: 40,
    unite: '%',
    source: 'reglages',
  },
  {
    cle: 'heures_travail_max',
    niveau: 'aucun',
    profil: 'intl',
    valeur: 964,
    unite: 'heures / an',
    source: 'droits',
  },
];

const UNIVERSEL = ['fr_ue', 'boursier', 'intl'];

// elig: [fr_ue, boursier, intl] -> [statut, précision affichée dans le badge]
export const AIDES = [
  {
    slug: 'bourse-criteres-sociaux',
    miseEnAvant: true,
    nom: 'Bourse sur critères sociaux',
    organisme: 'CROUS',
    description:
      'Une aide mensuelle selon les revenus de vos parents. Elle offre aussi les droits d’inscription et la CVEC.',
    categorie: 'etudes',
    frequence: 'mensuelle',
    commentDemander:
      'Remplissez votre Dossier social étudiant (DSE) sur messervices.etudiant.gouv.fr, de préférence au printemps avant la rentrée.',
    lienDemarche: 'https://www.messervices.etudiant.gouv.fr',
    elig: [
      ['sous_conditions', 'Selon vos ressources'],
      ['oui', 'Vous en bénéficiez'],
      ['sous_conditions', 'Selon vos ressources et votre situation'],
    ],
  },
  {
    slug: 'aide-logement-apl-als',
    miseEnAvant: true,
    nom: 'Aide au logement (APL / ALS)',
    organisme: 'CAF',
    description:
      'La CAF verse chaque mois une partie de votre loyer, y compris en résidence CROUS.',
    categorie: 'logement',
    frequence: 'mensuelle',
    commentDemander: 'Faites votre demande en ligne sur caf.fr dès la signature de votre bail.',
    lienDemarche: 'https://www.caf.fr',
    codeOpenfisca: 'aide_logement',
    elig: [
      ['oui', 'Vous y avez droit'],
      ['oui', 'Vous y avez droit'],
      ['sous_conditions', 'Titre de séjour en cours de validité'],
    ],
  },
  {
    slug: 'garantie-visale',
    miseEnAvant: true,
    nom: 'Garantie Visale',
    organisme: 'Action Logement',
    description: 'Une caution gratuite qui remplace le garant auprès du propriétaire.',
    categorie: 'logement',
    frequence: 'ponctuelle',
    commentDemander: 'Créez votre visa sur visale.fr AVANT de signer le bail.',
    lienDemarche: 'https://www.visale.fr',
    elig: [
      ['oui', 'Vous y avez droit'],
      ['oui', 'Vous y avez droit'],
      ['oui', 'Vous y avez droit'],
    ],
  },
  {
    slug: 'avance-loca-pass',
    nom: 'Avance Loca-Pass',
    organisme: 'Action Logement',
    description: 'Un prêt sans intérêt pour avancer votre dépôt de garantie.',
    categorie: 'logement',
    frequence: 'ponctuelle',
    commentDemander:
      'Demandez-la sur actionlogement.fr, au plus tard 2 mois après l’entrée dans le logement.',
    lienDemarche: 'https://www.actionlogement.fr',
    elig: [
      ['sous_conditions', 'Sous conditions'],
      ['sous_conditions', 'Sous conditions'],
      ['sous_conditions', 'Sous conditions'],
    ],
  },
  {
    slug: 'aide-specifique-ponctuelle',
    miseEnAvant: true,
    nom: 'Aide spécifique ponctuelle',
    organisme: 'CROUS',
    description:
      'Une aide d’urgence en cas de coup dur : perte de job, frais imprévus, retard de bourse…',
    categorie: 'urgence',
    frequence: 'ponctuelle',
    commentDemander:
      'Prenez rendez-vous avec une assistante sociale du CROUS ou de votre université.',
    elig: [
      ['oui', 'Sur dossier'],
      ['oui', 'Sur dossier'],
      ['sous_conditions', 'Sur dossier'],
    ],
  },
  {
    slug: 'exoneration-droits-inscription',
    nom: 'Exonération des droits d’inscription',
    organisme: 'Votre université',
    description: 'Votre université peut ramener vos droits d’inscription au tarif national.',
    categorie: 'etudes',
    frequence: 'ponctuelle',
    commentDemander:
      'Déposez une demande d’exonération auprès du service des inscriptions de votre université.',
    elig: [
      ['non', 'Non concerné'],
      ['non', 'Non concerné'],
      ['sous_conditions', 'Selon votre université'],
    ],
  },
  {
    slug: 'repas-crous-tarif-social',
    nom: 'Repas CROUS à tarif social',
    organisme: 'CROUS',
    description: 'Un repas complet au restaurant universitaire à petit prix.',
    categorie: 'alimentation',
    frequence: 'ponctuelle',
    commentDemander: 'Présentez votre carte d’étudiant (Izly) au restaurant universitaire.',
    elig: [
      ['oui', 'Ouvert à tous'],
      ['oui', 'Ouvert à tous'],
      ['oui', 'Ouvert à tous'],
    ],
  },
  {
    slug: 'fonds-solidarite-logement',
    nom: 'Fonds de solidarité logement',
    organisme: 'Département',
    description: 'Une aide pour payer le dépôt de garantie, le premier loyer ou des impayés.',
    categorie: 'logement',
    frequence: 'ponctuelle',
    commentDemander: 'Contactez le service social de votre département.',
    elig: [
      ['sous_conditions', 'Selon le département'],
      ['sous_conditions', 'Selon le département'],
      ['sous_conditions', 'Selon le département'],
    ],
  },
];

export const POSTES_RENTREE = [
  {
    nom: 'Dépôt de garantie',
    montant: 637,
    aide: 'avance-loca-pass',
    astuce: 'Avance Loca-Pass ou FSL',
  },
  {
    nom: 'Matériel pédagogique',
    montant: 502,
    aide: 'aide-specifique-ponctuelle',
    astuce: 'Aide ponctuelle du CROUS si besoin',
  },
  {
    nom: 'Frais d’agence',
    montant: 326,
    aide: null,
    astuce: 'Évitez-les : logement CROUS ou de particulier',
  },
  {
    nom: 'Frais pédagogiques complémentaires',
    montant: 214,
    aide: null,
    astuce: 'Pensez aux livres d’occasion et à la BU',
  },
  {
    nom: 'Droits d’inscription',
    montant: 178,
    aide: 'bourse-criteres-sociaux',
    astuce: 'Offerts si vous êtes boursier',
  },
  { nom: 'Vêtements', montant: 133, aide: null, astuce: 'Friperies et ressourceries' },
  {
    nom: 'CVEC',
    montant: 105,
    aide: 'bourse-criteres-sociaux',
    astuce: 'Offerte si vous êtes boursier',
  },
];

export const ASSOCIATIONS = [
  {
    nom: 'AGORAé',
    description: 'Épiceries solidaires gérées par et pour les étudiants.',
    lien: 'https://www.agoraes.fr',
  },
  {
    nom: 'Cop1 – Solidarités Étudiantes',
    description: 'Distributions alimentaires et accompagnement pour les étudiants.',
    lien: 'https://www.cop1.fr',
  },
];

export const RESSOURCES = [
  {
    titre: 'Faire mon Dossier social étudiant (bourse, logement CROUS)',
    type: 'Démarche en ligne',
    categorie: 'aides',
    organisme: 'messervices.etudiant.gouv.fr',
    annee: '2026',
    url: 'https://www.messervices.etudiant.gouv.fr',
  },
  {
    titre: 'Demander une caution Visale',
    type: 'Démarche en ligne',
    categorie: 'aides',
    organisme: 'visale.fr',
    annee: '2026',
    url: 'https://www.visale.fr',
  },
  {
    titre: 'Aides au logement des étudiants',
    type: 'Page d’information',
    categorie: 'aides',
    organisme: 'CAF',
    annee: '2026',
    url: 'https://www.caf.fr',
  },
];

export { UNIVERSEL };
