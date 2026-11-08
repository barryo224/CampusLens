import { useEffect, useRef } from 'react';
import { defilerVersResultats, hauteurSousBarreRecherche } from './defilerVersResultats.js';

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
    // Un instant plus tard : Safari ajuste lui-même le défilement au moment de la frappe, notre déplacement doit passer APRÈS.
    const minuterie = window.setTimeout(() => {
      const zone = document.getElementById(idResultats);
      if (zone && zone.getBoundingClientRect().top < hauteurSousBarreRecherche())
        defilerVersResultats(zone);
    }, 60);
    return () => window.clearTimeout(minuterie);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependances);
}
