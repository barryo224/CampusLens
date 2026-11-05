/**
 * Lien qui MÈNE HORS de la page courante (site officiel, source, tarifs, ou « Voir le site » depuis l'administration).
 * Il s'ouvre toujours dans un nouvel onglet : on ne perd ni sa page, ni sa saisie, ni sa session d'administration.
 *  - rel="noopener noreferrer" : la page ouverte ne peut pas agir sur la nôtre (sécurité) ;
 *  - « (nouvel onglet) » est annoncé aux lecteurs d'écran (accessibilité), sauf si le lien porte déjà son propre libellé.
 */
export default function LienExterne({ href, children, annonce = true, ...reste }) {
  return (
    <a {...reste} href={href} target="_blank" rel="noopener noreferrer">
      {children}
      {annonce && (
        <>
          {' '}
          <span className="sr-only">(nouvel onglet)</span>
        </>
      )}
    </a>
  );
}
