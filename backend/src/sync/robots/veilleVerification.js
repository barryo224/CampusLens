import { creerVeillePage } from './veillePage.js';

/**
 * Veille des pages officielles dont dépendent les aides saisies à la main (APL, Visale, aide spécifique…).
 * Elle ne remplit aucune valeur : elle sert à savoir si la page a changé depuis la dernière vérification.
 */
export const creerVeilleVerification = (cle) => creerVeillePage({ cle, veilleVerification: true });

export const CLES_VEILLE = [
  'veille_apl',
  'veille_visale',
  'veille_aide_specifique',
  'veille_fsl',
  'veille_cout_inscription',
  'veille_bourse',
  'veille_loca_pass',
  'veille_repas_crous',
  'veille_visa',
  'veille_travail_etranger',
];

export const ROBOTS_VEILLE = Object.fromEntries(
  CLES_VEILLE.map((cle) => [cle, creerVeilleVerification(cle)]),
);
