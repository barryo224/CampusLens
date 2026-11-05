import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Menu qui se replie en « trois tirets » sur téléphone et tablette.
 * Il se referme avec la croix, en choisissant une page, avec Échap, ou en touchant le fond assombri (un vrai tap :
 * faire défiler ou frôler l'écran ne le ferme pas). Pendant qu'il est ouvert, la page dessous ne défile pas.
 * Sur grand écran le menu reste affiché (le bouton est masqué en CSS).
 */
export function useMenuRepliable() {
  const [ouvert, setOuvert] = useState(false);
  const { pathname } = useLocation();

  // Changement de page : le menu se referme (on ajuste l'état pendant le rendu, sans effet).
  const [pageVue, setPageVue] = useState(pathname);
  if (pageVue !== pathname) {
    setPageVue(pathname);
    setOuvert(false);
  }

  useEffect(() => {
    if (!ouvert) return undefined;
    const surTouche = (e) => e.key === 'Escape' && setOuvert(false);
    document.addEventListener('keydown', surTouche);
    document.documentElement.classList.add('menu-bloque'); // la page dessous ne défile plus
    return () => {
      document.removeEventListener('keydown', surTouche);
      document.documentElement.classList.remove('menu-bloque');
    };
  }, [ouvert]);

  const basculer = useCallback(() => setOuvert((o) => !o), []);
  const fermer = useCallback(() => setOuvert(false), []);
  return { ouvert, basculer, fermer };
}
