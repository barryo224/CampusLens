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
export function defilerVersResultats(zone) {
  if (!zone) return;
  const barre = document.querySelector('.recherche-collante');
  let dessous = 0;
  if (barre) {
    const style = getComputedStyle(barre);
    const decalage = parseFloat(style.top) || 0; // 0 sur ordinateur, hauteur de la barre verte sinon
    const marges = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const champ = barre.querySelector('input');
    dessous = decalage + marges + (champ ? champ.offsetHeight : barre.offsetHeight);
  }
  const cible = zone.getBoundingClientRect().top + window.scrollY - dessous - 8;
  window.scrollTo({ top: Math.max(0, cible), left: 0, behavior: 'auto' });
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
