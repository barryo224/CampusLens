/**
 * Beaucoup de sites officiels refusent les robots qui tournent sur un serveur (adresse de centre de données) alors que
 * leur page s'ouvre normalement dans un navigateur : refus (401, 403, 429) ou connexion coupée. Ce n'est pas une panne du
 * site ni un changement de prix : la source ne peut être vérifiée qu'à la main.
 */
const REFUS = /a répondu (401|403|429)\b/i;
const COUPURE = /injoignable \(erreur réseau\)/i;

export const estBlocageRobot = (erreur) => {
  const message = String(erreur?.message ?? erreur ?? '');
  return REFUS.test(message) || COUPURE.test(message);
};
