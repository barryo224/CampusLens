import { VILLES_SUIVIES } from './villes.js';

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
    // Choix éditoriaux de CampusLens (seuils, surface type d'un studio…) : ce ne sont pas des faits à vérifier
    // auprès d'une source externe, ils sont validés par l'éditeur et ne « périment » pas.
    nom: 'Réglages de calcul CampusLens',
    organisme: 'CampusLens',
    url: 'https://github.com/',
    type: 'page_web',
    frequenceHeures: 24 * 365 * 5,
    valideParEditeur: true,
  },
  // Aides dont la page officielle n'a pas encore été relevée : on ne prétend pas à une source précise.
  fiches: {
    nom: 'Aides : organismes concernés',
    anciensNoms: ['Fiches pratiques Service-Public'],
    organisme: 'CAF, CROUS, universités, départements',
    url: 'https://www.etudiant.gouv.fr',
    type: 'page_web',
    frequenceHeures: 24 * 30,
  },
  // Pages officielles réellement consultées le 5 novembre 2026 (vérification manuelle, refaite chaque mois).
  bourseServicePublic: {
    cle: 'veille_bourse', // veille : la vérification reste valable tant que la page ne change pas
    nom: 'Étudiant : bourse sur critères sociaux',
    organisme: 'Service-Public.fr',
    url: 'https://www.service-public.fr/particuliers/vosdroits/F12214',
    type: 'page_web',
    frequenceHeures: 24 * 3,
  },
  aplServicePublic: {
    cle: 'veille_apl', // veille : la vérification reste valable tant que la page ne change pas
    nom: 'Aide personnalisée au logement (APL)',
    organisme: 'Service-Public.fr',
    url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F12006',
    type: 'page_web',
    frequenceHeures: 24 * 3,
  },
  visaleServicePublic: {
    cle: 'veille_visale', // veille : la vérification reste valable tant que la page ne change pas
    nom: 'Garantie Visale',
    organisme: 'Service-Public.fr',
    url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F32320',
    type: 'page_web',
    frequenceHeures: 24 * 3,
  },
  aideSpecifiqueServicePublic: {
    cle: 'veille_aide_specifique', // veille : la vérification reste valable tant que la page ne change pas
    nom: 'Aide spécifique ponctuelle pour étudiant en difficulté',
    organisme: 'Service-Public.fr',
    url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F34073',
    type: 'page_web',
    frequenceHeures: 24 * 3,
  },
  fslServicePublic: {
    cle: 'veille_fsl', // veille : la vérification reste valable tant que la page ne change pas
    nom: 'Aide pour le dépôt de garantie (Loca-Pass, FSL)',
    organisme: 'Service-Public.fr',
    url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/N20359',
    type: 'page_web',
    frequenceHeures: 24 * 3,
  },
  coutInscriptionServicePublic: {
    cle: 'veille_cout_inscription', // veille : la vérification reste valable tant que la page ne change pas
    nom: 'Coût d’une inscription dans l’enseignement supérieur',
    organisme: 'Service-Public.fr',
    url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F2865',
    type: 'page_web',
    frequenceHeures: 24 * 3,
  },
  transportParis: {
    nom: 'Tarifs Imagine R Étudiant (Île-de-France Mobilités)',
    organisme: 'Île-de-France Mobilités',
    url: 'https://www.iledefrance-mobilites.fr/titres-et-tarifs/detail/forfait-imagine-r-etudiant',
    type: 'page_web',
    frequenceHeures: 24 * 90,
  },
  transportMarseille: {
    nom: 'Tarifs RTM (Marseille)',
    organisme: 'RTM',
    url: 'https://www.rtm.fr/tarifs',
    type: 'page_web',
    frequenceHeures: 24 * 90,
  },
  transportLyon: {
    nom: 'Tarifs TCL (Lyon)',
    organisme: 'TCL / SYTRAL Mobilités',
    url: 'https://www.tcl.fr/tickets-abonnements/titres-et-tarifs/18-25-ans-12-mois',
    type: 'page_web',
    frequenceHeures: 24 * 90,
  },
  transportToulouse: {
    nom: 'Tarifs Tisséo (Toulouse)',
    organisme: 'Tisséo',
    url: 'https://eboutique.tisseo.fr/fr/produits/annuel-niveau-3-etudiants-20-25ans',
    type: 'page_web',
    frequenceHeures: 24 * 90,
  },
  transportNantes: {
    nom: 'Tarifs Naolib (Nantes)',
    organisme: 'Naolib',
    url: 'https://naolib.fr/fr/tarifs/transports-en-commun/formule-illimitee-26',
    type: 'page_web',
    frequenceHeures: 24 * 90,
  },
  transportRennes: {
    nom: 'Tarifs STAR (Rennes)',
    organisme: 'STAR',
    url: 'https://www.star.fr/titres-et-tarifs/trouver-mon-tarif/forfait-etudiant-12-mois',
    type: 'page_web',
    frequenceHeures: 24 * 90,
  },
  transportDijon: {
    nom: 'Tarifs Divia (Dijon)',
    organisme: 'Divia Mobilités',
    url: 'https://www.divia.fr/titres-et-tarifs/trouver-et-acheter-mon-titre',
    type: 'page_web',
    frequenceHeures: 24 * 90,
  },
  transportNice: {
    nom: 'Tarifs Lignes d’Azur (Nice)',
    organisme: 'Lignes d’Azur',
    url: 'https://www.lignesdazur.com/en/titres-et-tarifs/ma-carte-lignes-dazur/',
    type: 'page_web',
    frequenceHeures: 24 * 90,
  },
  transportStrasbourg: {
    nom: 'Tarifs CTS (Strasbourg)',
    organisme: 'CTS',
    url: 'https://www.cts-strasbourg.eu/fr/Titres-de-transport/tarifs/Abonnements/',
    type: 'page_web',
    frequenceHeures: 24 * 90,
  },
  transportGrenoble: {
    nom: 'Tarifs M réso (Grenoble)',
    organisme: 'M réso',
    url: 'https://www.reso-m.fr/tarifs',
    type: 'page_web',
    frequenceHeures: 24 * 90,
  },
  locaPass: {
    cle: 'veille_loca_pass', // veille : la vérification reste valable tant que la page ne change pas
    nom: 'Avance Loca-Pass',
    organisme: 'Action Logement',
    url: 'https://www.actionlogement.fr/l-avance-loca-pass',
    type: 'page_web',
    frequenceHeures: 24 * 3,
  },
  repasCrous: {
    cle: 'veille_repas_crous', // veille : la vérification reste valable tant que la page ne change pas
    nom: 'Restauration universitaire (repas Crous à 1 €)',
    organisme: 'Étudiant.gouv.fr',
    url: 'https://www.etudiant.gouv.fr/fr/restauration-universitaire',
    type: 'page_web',
    frequenceHeures: 24 * 3,
  },
  travailEtranger: {
    nom: 'Travailler pendant ses études (étudiants étrangers)',
    organisme: 'Campus France',
    url: 'https://www.campusfrance.org/en/working-student',
    type: 'page_web',
    frequenceHeures: 24 * 90,
  },
  associations: {
    nom: 'Sites des associations d’entraide',
    organisme: 'Associations',
    url: 'https://www.agoraes.fr',
    type: 'page_web',
    frequenceHeures: 24 * 90,
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

// Villes étudiantes suivies : communes où le CNOUS recense au moins une résidence CROUS, plus des villes
// universitaires (Corse comprise). Liste générée (scripts/generer-villes.mjs). Le robot remplit les valeurs ;
// on ne les écrit jamais ici.
export const VILLES = VILLES_SUIVIES.map(([codeInsee, nom, region]) => ({
  codeInsee,
  nom,
  region,
}));

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
    source: 'travailEtranger',
  },
];

const UNIVERSEL = ['fr_ue', 'boursier', 'intl'];

// elig: [fr_ue, boursier, intl] -> [statut, précision affichée dans le badge]
export const AIDES = [
  {
    slug: 'bourse-criteres-sociaux',
    source: 'bourseServicePublic',
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
      ['sous_conditions', 'Domicile fiscal en France depuis 2 ans'],
    ],
  },
  {
    slug: 'aide-logement-apl-als',
    source: 'aplServicePublic',
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
      ['sous_conditions', 'Depuis juillet 2026 : boursier, salarié ou apprenti'],
    ],
  },
  {
    slug: 'garantie-visale',
    source: 'visaleServicePublic',
    miseEnAvant: true,
    nom: 'Garantie Visale',
    organisme: 'Action Logement',
    description: 'Une caution gratuite qui remplace le garant auprès du propriétaire.',
    categorie: 'logement',
    frequence: 'ponctuelle',
    commentDemander: 'Créez votre visa sur visale.fr AVANT de signer le bail.',
    lienDemarche: 'https://www.visale.fr',
    elig: [
      ['oui', 'Jusqu’à 30 ans'],
      ['oui', 'Jusqu’à 30 ans'],
      ['sous_conditions', 'Titre de séjour étudiant, jusqu’à 30 ans'],
    ],
  },
  {
    slug: 'avance-loca-pass',
    source: 'locaPass',
    nom: 'Avance Loca-Pass',
    organisme: 'Action Logement',
    description:
      'Un prêt à 0 % (jusqu’à 1 200 €, remboursable en 25 mois) pour avancer votre dépôt de garantie. Pour les étudiants salariés ou boursiers d’État.',
    categorie: 'logement',
    frequence: 'ponctuelle',
    commentDemander:
      'Faites votre demande en ligne sur actionlogement.fr, avec les justificatifs demandés : contrat de travail ou convention de stage de 3 mois minimum, ou attestation de bourse.',
    lienDemarche: 'https://www.actionlogement.fr/l-avance-loca-pass',
    elig: [
      ['sous_conditions', 'Étudiant salarié ou boursier d’État'],
      ['oui', 'Boursier d’État'],
      ['sous_conditions', 'Salarié (3 mois min.) ou boursier d’État'],
    ],
  },
  {
    slug: 'aide-specifique-ponctuelle',
    source: 'aideSpecifiqueServicePublic',
    miseEnAvant: true,
    nom: 'Aide spécifique ponctuelle',
    organisme: 'CROUS',
    description:
      'Une aide d’urgence en cas de coup dur : perte de job, frais imprévus, retard de bourse… Jusqu’à 3 071 € versés en une fois, pour les moins de 35 ans.',
    categorie: 'urgence',
    frequence: 'ponctuelle',
    commentDemander:
      'Contactez le service social de votre Crous : un entretien avec une assistante sociale, puis une commission examine votre dossier de façon anonyme.',
    elig: [
      ['oui', 'Sur dossier'],
      ['oui', 'Sur dossier'],
      ['sous_conditions', 'Sur dossier'],
    ],
  },
  {
    slug: 'exoneration-droits-inscription',
    source: 'coutInscriptionServicePublic',
    nom: 'Exonération des droits d’inscription',
    organisme: 'Votre université',
    description:
      'Le président de votre université peut, sur demande et selon votre situation, vous dispenser de tout ou partie des droits d’inscription. Les critères et le nombre d’exonérations varient d’un établissement à l’autre.',
    categorie: 'etudes',
    frequence: 'ponctuelle',
    commentDemander:
      'Déposez une demande motivée, avec justificatifs, auprès du service des inscriptions de votre université : renseignez-vous sur ses critères et sa date limite.',
    elig: [
      ['non', 'Non concerné'],
      ['non', 'Non concerné'],
      ['sous_conditions', 'Selon votre université'],
    ],
  },
  {
    slug: 'repas-crous-tarif-social',
    source: 'repasCrous',
    nom: 'Repas Crous à 1 €',
    organisme: 'CROUS',
    description:
      'Un repas complet à 1 € pour tous les étudiants, dans les restaurants universitaires des Crous.',
    categorie: 'alimentation',
    frequence: 'ponctuelle',
    commentDemander:
      'Rendez-vous dans un restaurant universitaire Crous avec votre carte d’étudiant. Les modalités pratiques sont détaillées sur etudiant.gouv.fr.',
    lienDemarche: 'https://www.etudiant.gouv.fr/fr/restauration-universitaire',
    elig: [
      ['oui', 'Ouvert à tous'],
      ['oui', 'Ouvert à tous'],
      ['oui', 'Ouvert à tous'],
    ],
  },
  {
    slug: 'fonds-solidarite-logement',
    source: 'fslServicePublic',
    nom: 'Fonds de solidarité logement',
    organisme: 'Département',
    description:
      'Une aide du Département (souvent un prêt sans intérêt) pour payer le dépôt de garantie, le premier loyer ou des frais d’entrée. Chaque département a son propre règlement : montants et conditions varient.',
    categorie: 'logement',
    frequence: 'ponctuelle',
    commentDemander:
      'Contactez le service social ou le Conseil départemental de votre lieu de résidence, qui vous remettra le règlement du FSL et le dossier à remplir.',
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

// Abonnements de transport étudiants relevés sur les pages officielles des réseaux (5 novembre 2026).
// Le montant annuel est celui du titre le moins cher réservé aux étudiants ; le site affiche l'équivalent mensuel.
// Ajouter une ville = une ligne ici (réseau, titre, prix annuel, page officielle) puis la vérifier dans l'administration.
export const TARIFS_TRANSPORT = [
  {
    codeInsee: '75056',
    source: 'transportParis',
    reseau: 'Île-de-France Mobilités',
    libelle: 'Forfait Imagine R Étudiant',
    montantAnnuel: 401.3,
    conditions:
      'Moins de 26 ans, en formation initiale. Frais de dossier de 8 € inclus, 2026-2027.',
    urlTarifs:
      'https://www.iledefrance-mobilites.fr/titres-et-tarifs/detail/forfait-imagine-r-etudiant',
  },
  {
    codeInsee: '13055',
    source: 'transportMarseille',
    reseau: 'RTM',
    libelle: 'Pass Annuel Étudiant',
    montantAnnuel: 200,
    conditions:
      'De 18 à 25 ans inclus, étudiant. Métro, tram, bus et TER intra-muros. Tarif au 1er novembre 2026.',
    urlTarifs: 'https://www.rtm.fr/tarifs',
  },
  {
    codeInsee: '38185',
    source: 'transportGrenoble',
    reseau: 'M réso',
    libelle: 'Abonnement 18-25 ans Études (1 an)',
    montantAnnuel: 192,
    conditions:
      'Justificatif d’inscription ou numéro INE. Tarif au 1er septembre 2026 (19,20 € les 30 jours).',
    urlTarifs: 'https://www.reso-m.fr/tarifs',
  },
  {
    codeInsee: '69123',
    source: 'transportLyon',
    reseau: 'TCL',
    libelle: 'Abonnement 18-25 ans (12 mois), zones 1 et 2',
    montantAnnuel: 260,
    conditions:
      '18 à 25 ans inclus (pas de condition d’études). Zones 1 et 2 ; 153 € à 350 € selon les zones. Tarif boursier distinct.',
    urlTarifs: 'https://www.tcl.fr/tickets-abonnements/titres-et-tarifs/18-25-ans-12-mois',
  },
  {
    codeInsee: '31555',
    source: 'transportToulouse',
    reseau: 'Tisséo',
    libelle: 'Annuel étudiant 20-25 ans',
    montantAnnuel: 169.6,
    montantMensuel: 16,
    conditions:
      '20 à 25 ans révolus, justificatif d’inscription. Pass 31 jours à 16 € ; l’annuel (169,60 €) se paie comptant. Carte Pastel 10 € si besoin.',
    urlTarifs: 'https://eboutique.tisseo.fr/fr/produits/annuel-niveau-3-etudiants-20-25ans',
  },
  {
    codeInsee: '44109',
    source: 'transportNantes',
    reseau: 'Naolib',
    libelle: 'Formule illimitée -26 ans (12 mois)',
    montantAnnuel: 255,
    conditions:
      'Moins de 26 ans, prélèvement mensuel, tarif au 1er juillet 2026. Réduction selon le quotient familial.',
    urlTarifs: 'https://naolib.fr/fr/tarifs/transports-en-commun/formule-illimitee-26',
  },
  {
    codeInsee: '35238',
    source: 'transportRennes',
    reseau: 'STAR',
    libelle: 'Forfait étudiant 12 mois',
    montantAnnuel: 239.4,
    conditions:
      'Étudiants jusqu’à 26 ans, 19,95 € par mois sur 12 mois (3 mois offerts annoncés : coût réel possiblement inférieur). Tarif réduit pour les boursiers.',
    urlTarifs: 'https://www.star.fr/titres-et-tarifs/trouver-mon-tarif/forfait-etudiant-12-mois',
  },
  {
    codeInsee: '21231',
    source: 'transportDijon',
    reseau: 'Divia Mobilités',
    libelle: 'Pass annuel 18/25',
    montantAnnuel: 260,
    conditions: '18 à 25 ans, 12 mois. Boursiers : -50 %.',
    urlTarifs: 'https://www.divia.fr/titres-et-tarifs/trouver-et-acheter-mon-titre',
  },
  {
    codeInsee: '06088',
    source: 'transportNice',
    reseau: 'Lignes d’Azur',
    libelle: 'Abonnement annuel moins de 26 ans',
    montantAnnuel: 180,
    conditions: 'Moins de 26 ans ; 12 € de frais de gestion en plus la première fois.',
    urlTarifs: 'https://www.lignesdazur.com/en/titres-et-tarifs/ma-carte-lignes-dazur/',
  },
  {
    codeInsee: '67482',
    source: 'transportStrasbourg',
    reseau: 'CTS',
    libelle: 'Abonnement tarif plein 18-25 ans (annuel)',
    montantAnnuel: 280,
    conditions:
      '18 à 25 ans, 28 € par mois, 2 mois offerts sur l’annuel. Tarif réduit dès 3,40 € par mois pour les boursiers.',
    urlTarifs: 'https://www.cts-strasbourg.eu/fr/Titres-de-transport/tarifs/Abonnements/',
  },
];

export { UNIVERSEL };
