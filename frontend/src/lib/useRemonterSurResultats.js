import { useEffect, useRef } from 'react';

/**
 * Quand la recherche (ou un filtre) change alors qu'on a défilé loin dans une longue liste, la liste raccourcit et la page
 * se recale n'importe où : on remonte au début des résultats, juste sous la barre de recherche collée.
 * Si le début des résultats est déjà à l'écran, rien ne bouge (aucun saut inutile).
 */
export function useRemonterSurResultats(idResultats, ...dependances) {
  const premiere = useRef(true);
  useEffect(() => {
    if (premiere.current) {
      premiere.current = false; // au chargement de la page : on ne touche à rien
      return;
    }
    const zone = document.getElementById(idResultats);
    if (zone && zone.getBoundingClientRect().top < 0) zone.scrollIntoView?.({ block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependances);
}
