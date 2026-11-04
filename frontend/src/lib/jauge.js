/**
 * Position de l'aiguille de la jauge, de 0 (tout à gauche) à 1 (tout à droite).
 * L'échelle se déduit du seuil de fragilité (qui vient de la base) :
 *   [−seuil ; 0[ → zone rouge, [0 ; seuil[ → zone orange, [seuil ; 2×seuil] → zone verte.
 * Aucune valeur n'est fixée en dur.
 */
export function positionJauge(resteAVivre, seuilFragile) {
  if (!(seuilFragile > 0)) return resteAVivre < 0 ? 1 / 6 : 5 / 6;
  const f = (resteAVivre + seuilFragile) / (3 * seuilFragile);
  return Math.min(1, Math.max(0, f));
}
