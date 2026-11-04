/**
 * Une donnée est « à vérifier » si :
 *  - elle n'a jamais été vérifiée (verifieLe vide) ;
 *  - ou sa source est en erreur / marquée « à vérifier » ;
 *  - ou la source n'a pas été contrôlée depuis plus longtemps que sa fréquence.
 * Le site affiche alors une mention « à vérifier » à côté de la valeur.
 */
export function estAVerifier(source, verifieLe, maintenant = new Date()) {
  if (!verifieLe) return true;
  if (!source) return true;
  if (source.statut !== 'ok') return true;
  if (!source.dernierControle) return true;
  const ageHeures = (maintenant - new Date(source.dernierControle)) / 3_600_000;
  return ageHeures > source.frequenceHeures;
}
