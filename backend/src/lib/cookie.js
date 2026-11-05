/** Nom du cookie de session : en production, le préfixe __Host- le rend inutilisable par un site frère ou un sous-domaine. */
export const nomCookieSession = (production) =>
  production ? '__Host-campuslens.sid' : 'campuslens.sid';
