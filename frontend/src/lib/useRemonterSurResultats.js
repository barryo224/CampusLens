import { useEffect, useRef } from 'react';
import { defilerVersResultatsApresMiseEnPage } from './defilerVersResultats.js';

/**
 * Quand la recherche (ou un filtre) change alors qu'on a défilé loin dans une longue liste, la liste raccourcit et la page
 * se recale n'importe où : on remonte au début des résultats, juste sous la barre de recherche collée.
 * Si le début des résultats est déjà bien visible, rien ne bouge (aucun saut inutile). « Bien visible » veut dire sous la barre
 * de recherche collée : un début de liste caché derrière elle compte comme perdu.
 */
export function useRemonterSurResultats(idResultats, ...dependances) {
  const premiere = useRef(true);
  useEffect(() => {
    if (premiere.current) {
      premiere.current = false; // au chargement de la page : on ne touche à rien
      return;
    }
    // Plusieurs passages, un peu après : Safari ajuste lui-même le défilement au moment de la frappe, et la liste change de
    // hauteur juste après. Notre déplacement doit passer APRÈS, et se recaler si besoin.
    defilerVersResultatsApresMiseEnPage(idResultats, { seulementSiCache: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependances);
}
