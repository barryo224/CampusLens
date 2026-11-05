import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Menu qui se replie en « trois tirets » sur téléphone et tablette.
 * Il se referme tout seul : après un clic sur un lien (changement de page), avec Échap, en touchant ailleurs
 * ou dès que l'on fait défiler la page. Sur grand écran le menu reste affiché (le bouton est masqué en CSS).
 */
export function useMenuRepliable() {
  const [ouvert, setOuvert] = useState(false);
  const conteneur = useRef(null);
  const { pathname } = useLocation();

  // Changement de page : le menu se referme (on ajuste l'état pendant le rendu, sans effet).
  const [pageVue, setPageVue] = useState(pathname);
  if (pageVue !== pathname) {
    setPageVue(pathname);
    setOuvert(false);
  }

  useEffect(() => {
    if (!ouvert) return undefined;
    const departScroll = window.scrollY;
    const surTouche = (e) => e.key === 'Escape' && setOuvert(false);
    const surClic = (e) => {
      if (conteneur.current && !conteneur.current.contains(e.target)) setOuvert(false);
    };
    const surDefilement = () => {
      if (Math.abs(window.scrollY - departScroll) > 24) setOuvert(false);
    };
    document.addEventListener('keydown', surTouche);
    document.addEventListener('pointerdown', surClic);
    window.addEventListener('scroll', surDefilement, { passive: true });
    return () => {
      document.removeEventListener('keydown', surTouche);
      document.removeEventListener('pointerdown', surClic);
      window.removeEventListener('scroll', surDefilement);
    };
  }, [ouvert]);

  const basculer = useCallback(() => setOuvert((o) => !o), []);
  return { ouvert, basculer, conteneur };
}
