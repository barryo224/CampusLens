import { estAVerifier } from './fraicheur.js';

/** Champs publics d'une source (jamais l'empreinte interne). */
export function serialiserSource(s, maintenant) {
  if (!s) return null;
  return {
    id: s.id,
    nom: s.nom,
    organisme: s.organisme,
    url: s.url,
    type: s.type,
    statut: s.statut,
    dernierControle: s.dernierControle ?? null,
    dernierChangement: s.dernierChangement ?? null,
    licence: s.licence ?? null,
    aVerifier: estAVerifier(s, s.dernierControle, maintenant),
  };
}

/**
 * Ajoute `source`, `verifieLe` et `aVerifier` à un objet.
 * Règle de l'API : chaque donnée renvoyée porte sa source et sa date de vérification.
 */
export function avecSource(objet, source, maintenant = new Date()) {
  return {
    ...objet,
    source: serialiserSource(source, maintenant),
    verifieLe: objet.verifieLe ?? null,
    aVerifier: estAVerifier(source, objet.verifieLe, maintenant),
  };
}

/** Prisma renvoie les décimaux sous forme d'objets : on les convertit en nombres. */
export const nombre = (d) => (d === null || d === undefined ? null : Number(d));
