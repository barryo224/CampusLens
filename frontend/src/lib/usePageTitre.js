import { useEffect } from 'react';

/** Titre de la page d'accueil : c'est lui qu'affiche Google (nom du site + ce qu'il apporte). */
export const TITRE_ACCUEIL = 'CampusLens — Les repères pour bien vivre ses études en France';

/** Titre de l'onglet : utile aux lecteurs d'écran et à l'historique du navigateur. Sans titre : celui de l'accueil. */
export function usePageTitre(titre) {
  useEffect(() => {
    document.title = titre ? `${titre} · CampusLens` : TITRE_ACCUEIL;
  }, [titre]);
}
