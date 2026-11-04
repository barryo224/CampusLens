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
