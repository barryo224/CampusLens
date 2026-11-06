/**
 * Une donnée est « à vérifier » si :
 *  - elle n'a jamais été vérifiée (verifieLe vide) ;
 *  - ou sa source est en erreur / marquée « à vérifier » ;
 *  - ou la source n'a pas été contrôlée depuis plus longtemps que sa fréquence.
 *  - ou la vérification date de plus de 180 jours (même si la page surveillée n'a pas changé).
 * Exception : si le site de la source refuse les robots du serveur (`bloqueRobot`), le robot ne peut ni contrôler ni
 * alerter. Seule compte alors la vérification humaine, qui vaut 90 jours (au lieu de 180).
 * Le site affiche alors une mention « à vérifier » à côté de la valeur.
 */
/** Une vérification humaine ne vaut pas plus de 180 jours, quoi qu'il arrive. */
export const PLAFOND_VERIFICATION_HEURES = 24 * 180;
/** Source dont le site refuse les robots : plus de surveillance automatique, donc une vérification plus courte. */
export const PLAFOND_SOURCE_BLOQUEE_HEURES = 24 * 90;

export function estAVerifier(source, verifieLe, maintenant = new Date()) {
  if (!verifieLe) return true;
  if (!source) return true;
  if (source.statut !== 'ok') return true;
  if (source.bloqueRobot)
    return (maintenant - new Date(verifieLe)) / 3_600_000 > PLAFOND_SOURCE_BLOQUEE_HEURES;
  if (!source.dernierControle) return true;
  if ((maintenant - new Date(verifieLe)) / 3_600_000 > PLAFOND_VERIFICATION_HEURES) return true;
  const ageHeures = (maintenant - new Date(source.dernierControle)) / 3_600_000;
  return ageHeures > source.frequenceHeures;
}
