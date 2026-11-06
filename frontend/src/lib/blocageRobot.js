/**
 * Beaucoup de sites officiels (réseaux de transport, services de l'État) refusent les robots qui tournent sur un serveur
 * (adresse de centre de données) alors que leur page s'ouvre normalement dans un navigateur. Le robot reçoit alors un
 * refus (403, 401, 429) ou une coupure de connexion. Ce n'est ni un bug ni un prix qui a changé : la source se vérifie
 * à la main. Cette fonction reconnaît ces cas dans le message d'erreur du robot et le traduit en français clair.
 */
const REFUS = /a répondu (401|403|429)\b/i;
const COUPURE = /injoignable \(erreur réseau\)/i;

export function blocageRobot(message) {
  const texte = String(message ?? '');
  if (REFUS.test(texte))
    return 'Ce site refuse les robots du serveur (accès refusé) : à vérifier à la main.';
  if (COUPURE.test(texte))
    return 'Ce site ne répond pas aux robots du serveur (connexion coupée) : à vérifier à la main.';
  return null;
}
