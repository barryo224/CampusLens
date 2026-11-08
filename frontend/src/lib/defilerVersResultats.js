/**
 * Fait défiler la page pour que le début des résultats se place juste SOUS la barre de recherche collée (ou sous la barre
 * verte du téléphone s'il n'y a pas de barre collée).
 *
 * Deux précautions, découvertes avec Safari :
 *  - le calcul est fait ici plutôt que par `scrollIntoView`, que Safari interrompt en route dès qu'un élément « sticky »
 *    est en jeu ;
 *  - on se fie à la hauteur COMPACTE de la barre (champ + marges), pas à sa position du moment : quand la liste raccourcit,
 *    la page se recale tout en bas, la barre est repoussée hors de l'écran, mais une fois qu'on aura défilé elle sera de
 *    nouveau collée, avec cette hauteur compacte.
 */
/**
 * Distance, depuis le haut de l'écran, jusqu'au bas de la barre de recherche collée (dans sa hauteur compacte), ou jusqu'au
 * bas de la barre verte du téléphone s'il n'y a pas de barre collée : en dessous commence la zone réellement visible.
 */
export function hauteurSousBarreRecherche() {
  const barre = document.querySelector('.recherche-collante');
  if (!barre) return 0;
  const style = getComputedStyle(barre);
  const decalage = parseFloat(style.top) || 0; // 0 sur ordinateur, hauteur de la barre verte sinon
  const marges = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
  const champ = barre.querySelector('input');
  return decalage + marges + (champ ? champ.offsetHeight : barre.offsetHeight);
}

export function defilerVersResultats(zone) {
  if (!zone) return;
  const dessous = hauteurSousBarreRecherche();
  const cible = zone.getBoundingClientRect().top + window.scrollY - dessous - 8;
  window.scrollTo({ top: Math.max(0, cible), left: 0, behavior: 'auto' });
}

/**
 * Défile vers les résultats en PLUSIEURS passes. Juste après un choix (suggestion touchée, filtre changé), le contenu change
 * de hauteur : la liste raccourcit, le tableau se remesure, le navigateur recale la page. Un seul passage à 60 ms laissait la
 * page trop bas et le premier résultat à moitié caché derrière la barre collée (mesuré : 60 px cachés sur iPhone et sur un
 * ordinateur de 720 px de haut). Les passages suivants ne font rien si le début des résultats est déjà bien placé.
 *
 * @param seulementSiCache  ne défile que si le début des résultats est caché derrière la barre (cas du simple changement
 *   de recherche : on ne bouge pas une page déjà bien placée).
 */
export function defilerVersResultatsApresMiseEnPage(
  idResultats,
  { seulementSiCache = false } = {},
) {
  for (const delai of [60, 260, 650]) {
    window.setTimeout(() => {
      const zone = document.getElementById(idResultats);
      if (!zone) return;
      const dessous = hauteurSousBarreRecherche();
      const haut = zone.getBoundingClientRect().top;
      const place = Math.abs(haut - (dessous + 8)) <= 4;
      if (seulementSiCache ? haut >= dessous : place) return;
      defilerVersResultats(zone);
    }, delai);
  }
}

/**
 * Même principe pour un élément placé sous les barres du haut (barre verte du téléphone et barre « reste-à-vivre ») :
 * défilement calculé et immédiat, jamais `scrollIntoView` doux, que Safari interrompt avec un élément collant.
 */
export function defilerSousLesBarres(element, marge = 12) {
  if (!element) return;
  const haut =
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--haut-fixe')) || 0;
  const barre = document.querySelector('.barre-resultat:not(.barre-resultat-cachee)');
  const hauteurBarre = barre ? barre.offsetHeight : 0;
  const cible = element.getBoundingClientRect().top + window.scrollY - haut - hauteurBarre - marge;
  window.scrollTo({ top: Math.max(0, cible), left: 0, behavior: 'auto' });
}
