import { useCallback, useEffect, useState } from 'react';
import { get } from './api.js';

/**
 * Charge une ressource de l'API : { data, erreur, chargement, recharger }.
 * Passer `null` comme chemin pour ne rien charger.
 *
 * Le résultat mémorisé porte la « clé » de la requête qui l'a produit : si l'adresse
 * change ou si on clique « Réessayer », l'ancien résultat n'est plus affiché et
 * `chargement` repasse à vrai, sans modifier d'état dans l'effet.
 */
export function useApi(chemin) {
  const [essai, setEssai] = useState(0);
  const [resultat, setResultat] = useState({ cle: null, data: null, erreur: null });
  const cle = chemin ? `${chemin}#${essai}` : null;

  useEffect(() => {
    if (!cle) return undefined;
    const controleur = new AbortController();
    get(chemin, { signal: controleur.signal })
      .then((data) => setResultat({ cle, data, erreur: null }))
      .catch((erreur) => {
        if (erreur?.name === 'AbortError') return;
        setResultat({ cle, data: null, erreur });
      });
    return () => controleur.abort();
  }, [cle, chemin]);

  const aJour = resultat.cle === cle;
  const recharger = useCallback(() => setEssai((n) => n + 1), []);
  return {
    data: aJour ? resultat.data : null,
    erreur: aJour ? resultat.erreur : null,
    chargement: Boolean(cle) && !aJour,
    recharger,
  };
}
