import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// Position de défilement de chaque page visitée, pour que « Retour » ramène là où l'on était.
const positions = new Map();

/**
 * Changer de page ramène EN HAUT de la nouvelle page (sinon, après un clic dans le pied de page, on reste en bas et l'on
 * croit que rien ne s'est passé). Le bouton « Retour » du navigateur retrouve sa position ; changer d'onglet ou de filtre
 * dans une même page ne fait pas bouger l'écran. Le focus se place sur le contenu : un lecteur d'écran sait qu'on a changé de page.
 */
export function ScrollEnHaut() {
  const { pathname, hash, key } = useLocation();
  const type = useNavigationType();
  const dernierChemin = useRef(pathname);
  const premiere = useRef(true);

  useEffect(() => {
    const sauver = () => positions.set(key, window.scrollY);
    window.addEventListener('scroll', sauver, { passive: true });
    return () => window.removeEventListener('scroll', sauver);
  }, [key]);

  useLayoutEffect(() => {
    if (premiere.current) {
      premiere.current = false; // chargement initial : le navigateur s'en occupe
      return;
    }
    if (dernierChemin.current === pathname) return; // même page (onglet, filtre) : on ne bouge pas
    dernierChemin.current = pathname;
    const ancre = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
    if (ancre) {
      ancre.scrollIntoView();
      return;
    }
    if (type === 'POP' && positions.has(key)) {
      window.scrollTo(0, positions.get(key));
      return;
    }
    window.scrollTo(0, 0);
    document.getElementById('contenu')?.focus({ preventScroll: true });
    document.getElementById('contenu-admin')?.focus({ preventScroll: true });
  }, [pathname, hash, key, type]);

  return null;
}

/**
 * Le résultat d'une action doit toujours se voir. Quand un message d'erreur ou de confirmation (role « alert » ou
 * « status ») apparaît juste après un geste de l'utilisateur et qu'il est hors de l'écran (ou caché sous le clavier),
 * la page défile jusqu'à lui. Les textes réservés aux lecteurs d'écran (« sr-only ») sont ignorés.
 */
export function ResultatsVisibles() {
  useEffect(() => {
    let derniereAction = 0;
    const noter = () => {
      derniereAction = Date.now();
    };
    const gestes = ['pointerup', 'keyup', 'submit', 'click'];
    gestes.forEach((g) => document.addEventListener(g, noter, true));

    const selecteur = '[role="alert"], [role="status"]';
    const montrer = (el) => {
      if (!(el instanceof Element) || el.closest('.sr-only')) return;
      if (!el.textContent.trim()) return;
      if (Date.now() - derniereAction > 60_000) return; // pas lié à une action : on ne bouge pas
      const r = el.getBoundingClientRect();
      const bas = window.visualViewport?.height ?? window.innerHeight; // clavier exclu
      if (r.top >= 70 && r.bottom <= bas) return; // déjà visible, sous la barre verte
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    const observateur = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'characterData') {
          const el = m.target.parentElement?.closest(selecteur);
          if (el) montrer(el);
          continue;
        }
        for (const n of m.addedNodes) {
          if (n.nodeType === 3) {
            const el = n.parentElement?.closest(selecteur);
            if (el) montrer(el);
          } else if (n.nodeType === 1) {
            if (n.matches(selecteur)) montrer(n);
            n.querySelectorAll(selecteur).forEach(montrer);
          }
        }
      }
    });
    observateur.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      observateur.disconnect();
      gestes.forEach((g) => document.removeEventListener(g, noter, true));
    };
  }, []);
  return null;
}
