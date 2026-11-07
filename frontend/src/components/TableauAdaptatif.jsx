import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const nettoyer = (texte) => texte.replace(/\s+/g, ' ').trim();

/**
 * Tableau qui s'adapte à la place disponible, sans jamais enfermer le contenu dans un cadre défilant :
 *  - assez large (`seuil` pixels) : un vrai tableau en pleine largeur ;
 *  - plus étroit (téléphone, tablette…) : chaque ligne devient une carte, avec le nom de la colonne devant chaque valeur.
 * Les titres des colonnes restent collés en haut pendant le défilement de la page (sous la barre de recherche collée si
 * `sousRecherche`). `compact` : en cartes, le nom de la colonne est à gauche et la valeur à droite (tableaux de valeurs courtes, comme
 * Oui / Non / un montant). La page seule défile. Les rôles ARIA sont posés explicitement pour que les lecteurs d'écran gardent la structure de
 * tableau même quand les cartes sont affichées (certains navigateurs la perdent quand l'affichage change).
 */
export default function TableauAdaptatif({
  libelle,
  seuil = 760,
  compact = false,
  sousRecherche = false,
  children,
}) {
  const zone = useRef(null);
  const [largeur, setLargeur] = useState(0);
  // Largeur à laquelle le tableau a débordé : en dessous (ou à égalité), on affiche des cartes plutôt que de couper.
  const [debordeA, setDebordeA] = useState(null);
  const cartes = largeur > 0 && (largeur < seuil || (debordeA !== null && largeur <= debordeA));

  // Largeur disponible (avant l'affichage, pour éviter tout clignotement).
  useLayoutEffect(() => {
    const el = zone.current;
    if (!el) return undefined;
    const mesurer = () => setLargeur(el.clientWidth); // largeur nulle (test, élément caché) : on ne décide rien
    mesurer();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(el);
    return () => observateur.disconnect();
  }, []);

  // Un tableau qui ne tient pas dans la largeur disponible (mots longs…) passe en cartes : jamais de contenu coupé,
  // jamais de barre de défilement. À chaque affichage, car le contenu peut changer.
  useLayoutEffect(() => {
    const el = zone.current;
    if (!el || largeur === 0) return;
    const verifier = () => {
      if (debordeA !== null && largeur > debordeA) setDebordeA(null);
      else if (!cartes && el.scrollWidth > el.clientWidth + 1) setDebordeA(largeur);
    };
    verifier();
  });

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
    <div
      ref={zone}
      className={`tableau-adaptatif${cartes ? ' en-cartes' : ''}${compact ? ' compact' : ''}${sousRecherche ? ' sous-recherche' : ''}`}
      role="region"
      aria-label={libelle}
    >
      {children}
    </div>
  );
}
