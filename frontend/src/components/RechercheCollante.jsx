import { useEffect, useRef, useState } from 'react';

/**
 * Barre de recherche qui reste collée en haut de l'écran pendant qu'on fait défiler une longue liste (« Afficher plus »,
 * « Afficher plus »…) : on peut chercher à tout moment, sans remonter toute la page. Une fois collée, elle se fait plus
 * compacte (le titre et l'aide disparaissent à l'écran, mais restent lus par les lecteurs d'écran).
 * Sur téléphone et tablette, elle se colle sous la barre verte.
 */
export default function RechercheCollante({ children }) {
  const sentinelle = useRef(null);
  const boite = useRef(null);
  const [collee, setCollee] = useState(false);

  useEffect(() => {
    const repere = sentinelle.current;
    if (!repere || typeof IntersectionObserver === 'undefined') return undefined;
    // Hauteur de la barre verte collée en haut (téléphone et tablette seulement).
    const haut = window.matchMedia?.('(max-width: 900px)').matches ? 64 : 0;
    const observateur = new IntersectionObserver(
      ([e]) => setCollee(!e.isIntersecting && e.boundingClientRect.top < haut + 1),
      { rootMargin: `-${haut}px 0px 0px 0px`, threshold: 0 },
    );
    observateur.observe(repere);
    return () => observateur.disconnect();
  }, []);

  // Hauteur de la barre (collée, compacte) : les titres du tableau se collent juste sous elle.
  useEffect(() => {
    const el = boite.current;
    if (!el) return undefined;
    const racine = document.documentElement;
    const mesurer = () =>
      racine.style.setProperty('--hauteur-recherche', `${Math.round(el.offsetHeight)}px`);
    mesurer();
    if (typeof ResizeObserver === 'undefined')
      return () => racine.style.removeProperty('--hauteur-recherche');
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(el);
    return () => {
      observateur.disconnect();
      racine.style.removeProperty('--hauteur-recherche');
    };
  }, []);

  return (
    <>
      <div ref={sentinelle} className="sentinelle-collante" aria-hidden="true" />
      <div ref={boite} className={`recherche-collante${collee ? ' collee' : ''}`}>
        {children}
      </div>
    </>
  );
}
