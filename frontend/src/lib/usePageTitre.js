import { useEffect } from 'react';

/** Titre de l'onglet : utile aux lecteurs d'écran et à l'historique du navigateur. */
export function usePageTitre(titre) {
  useEffect(() => {
    document.title = titre ? `${titre} · CampusLens` : 'CampusLens';
  }, [titre]);
}
