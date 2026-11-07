import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const nettoyer = (texte) => texte.replace(/\s+/g, ' ').trim();

/**
 * Tableau qui s'adapte à la place disponible, sans jamais enfermer le contenu dans un cadre défilant :
 *  - assez large (`seuil` pixels) : un vrai tableau en pleine largeur ;
 *  - plus étroit (téléphone, tablette…) : chaque ligne devient une carte, avec le nom de la colonne devant chaque valeur.
 * `compact` : en cartes, le nom de la colonne est à gauche et la valeur à droite (tableaux de valeurs courtes, comme
 * Oui / Non / un montant). La page seule défile. Les rôles ARIA sont posés explicitement pour que les lecteurs d'écran gardent la structure de
 * tableau même quand les cartes sont affichées (certains navigateurs la perdent quand l'affichage change).
 */
export default function TableauAdaptatif({ libelle, seuil = 760, compact = false, children }) {
  const zone = useRef(null);
  const [cartes, setCartes] = useState(false);
  const [defile, setDefile] = useState(false);

  // Largeur disponible → tableau ou cartes (avant l'affichage, pour éviter tout clignotement).
  useLayoutEffect(() => {
    const el = zone.current;
    if (!el) return undefined;
    const mesurer = () => {
      const largeur = el.clientWidth;
      if (largeur > 0) setCartes(largeur < seuil); // largeur nulle (test, élément caché) : on ne décide rien
      setDefile(largeur > 0 && el.scrollWidth > largeur + 1);
    };
    mesurer();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(el);
    return () => observateur.disconnect();
  }, [seuil]);

  // Nom de colonne devant chaque valeur (mode cartes) et rôles de tableau ; refait à chaque changement de lignes.
  useEffect(() => {
    const el = zone.current;
    if (!el) return undefined;
    const etiqueter = () => {
      const table = el.querySelector('table');
      if (!table) return;
      table.setAttribute('role', 'table');
      table.querySelectorAll('thead, tbody').forEach((g) => g.setAttribute('role', 'rowgroup'));
      table.querySelectorAll('tr').forEach((tr) => tr.setAttribute('role', 'row'));
      const entetes = [...table.querySelectorAll('thead th')].map((th) => {
        th.setAttribute('role', 'columnheader');
        return nettoyer(th.textContent);
      });
      table.querySelectorAll('tbody tr').forEach((tr) => {
        [...tr.children].forEach((cellule, i) => {
          if (cellule.tagName === 'TH') {
            cellule.setAttribute('role', 'rowheader');
          } else {
            cellule.setAttribute('role', 'cell');
            if (entetes[i]) cellule.setAttribute('data-label', entetes[i]);
          }
        });
      });
    };
    etiqueter();
    const observateur = new MutationObserver(etiqueter);
    observateur.observe(el, { childList: true, subtree: true });
    return () => observateur.disconnect();
  }, []);

  return (
    // Focalisable seulement si le tableau déborde vraiment (règle WCAG « scrollable-region-focusable »).
    <div
      ref={zone}
      className={`tableau-adaptatif${cartes ? ' en-cartes' : ''}${compact ? ' compact' : ''}`}
      role="region"
      aria-label={libelle}
      tabIndex={defile && !cartes ? 0 : undefined}
    >
      {children}
    </div>
  );
}
