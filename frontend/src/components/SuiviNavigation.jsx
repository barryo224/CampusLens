import { useEffect, useLayoutEffect, useRef } from 'react';
import { Fragment, useState } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';

// Position de défilement de chaque page visitée, pour que « Retour » ramène là où l'on était.
const positions = new Map();

// Pages dont les saisies sont perdues quand on les quitte : au retour, le formulaire est vide et la page plus courte.
// Retrouver l'ancienne position ferait « sauter » la page : on revient en haut.
const PAGES_A_FORMULAIRE = new Set(['/evaluer', '/budget', '/contact', '/avis']);

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
    if (type === 'POP' && positions.has(key) && !PAGES_A_FORMULAIRE.has(pathname)) {
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
  const { pathname } = useLocation();
  const derniere = useRef(0);
  // Changer de page (menu, pied de page, retour) n'est pas une action « avec résultat » : on arrive en haut de la page,
  // sans descendre sur le décompte des aides ou des ressources.
  useLayoutEffect(() => {
    derniere.current = 0;
  }, [pathname]);
  useEffect(() => {
    const noter = (e) => {
      if (e.target instanceof Element && e.target.closest('a[href]')) return; // un lien ne produit pas de « résultat »
      derniere.current = Date.now();
    };
    const gestes = ['pointerup', 'keyup', 'submit', 'click'];
    gestes.forEach((g) => document.addEventListener(g, noter, true));

    const selecteur = '[role="alert"], [role="status"]';
    const montrer = (el) => {
      if (!(el instanceof Element) || el.closest('.sr-only')) return;
      if (!el.textContent.trim()) return;
      if (Date.now() - derniere.current > 60_000) return; // pas lié à une action : on ne bouge pas
      const r = el.getBoundingClientRect();
      const bas = window.visualViewport?.height ?? window.innerHeight; // clavier exclu
      if (r.top >= 70 && r.bottom <= bas) return; // déjà visible, sous la barre verte
      // Défilement calculé et immédiat : Safari interrompt (et fait « vibrer ») un défilement doux quand un élément
      // collant est présent.
      const cible = window.scrollY + r.top - (bas - r.height) / 2;
      window.scrollTo({ top: Math.max(0, cible), behavior: 'auto' });
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

/**
 * Recharger la page (F5, « restaurer ») repart de zéro : les choix gardés dans l'adresse (profil, niveau, besoin, onglet…)
 * sont effacés, comme dans les pages sans adresse paramétrée. Seul le chargement initial est concerné : un lien interne
 * « Voir les aides pour moi » garde, lui, son profil.
 */
let rechargementAPurger = (() => {
  try {
    return performance.getEntriesByType('navigation')[0]?.type === 'reload';
  } catch {
    return false;
  }
})();

/**
 * Pages publiques : recliquer sur le lien de la page où l'on se trouve (menu, logo, pied de page) la remet à zéro et
 * en haut, comme un premier passage. Le contenu est remonté à neuf (choix par défaut, saisies vides). Jamais dans l'admin.
 */
export function ReinitialiserPage({ children }) {
  const navigate = useNavigate();
  const { pathname, search, state } = useLocation();
  const demande = state?.rafraichir ?? null;
  const [vue, setVue] = useState(demande);
  const [cle, setCle] = useState(0);
  if (demande && demande !== vue) {
    setVue(demande);
    setCle((c) => c + 1);
  }

  // Rechargement (F5, « restaurer ») : le navigateur remet lui-même les choix précédents dans les cases et les listes.
  // Une fois le chargement terminé, on remonte la page à neuf (il ne restaure plus rien à ce moment-là) et on efface
  // l'adresse paramétrée : tout revient aux valeurs par défaut.
  const [cleRechargement, setCleRechargement] = useState(0);
  useEffect(() => {
    if (!rechargementAPurger) return undefined;
    const purger = () => {
      if (!rechargementAPurger) return;
      rechargementAPurger = false;
      if (search && !pathname.startsWith('/admin')) navigate(pathname, { replace: true });
      setCleRechargement((c) => c + 1);
    };
    if (document.readyState === 'complete') purger();
    else window.addEventListener('load', purger, { once: true });
    return () => window.removeEventListener('load', purger);
  }, [navigate, pathname, search]);

  useLayoutEffect(() => {
    if (cle > 0) {
      window.scrollTo(0, 0);
      document.getElementById('contenu')?.focus({ preventScroll: true });
    }
  }, [cle]);

  useEffect(() => {
    const surClic = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const lien = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!lien || lien.target === '_blank' || lien.hasAttribute('download')) return;
      const url = new URL(lien.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname !== pathname) return;
      if (pathname.startsWith('/admin') || url.search || url.hash) return;
      e.preventDefault();
      navigate(pathname, { state: { rafraichir: Date.now() } });
    };
    document.addEventListener('click', surClic, true);
    return () => document.removeEventListener('click', surClic, true);
  }, [navigate, pathname]);

  return <Fragment key={`${cle}-${cleRechargement}`}>{children}</Fragment>;
}
