/**
 * Conteneur d'un tableau large : il défile horizontalement sur petit écran.
 * Pour qu'un utilisateur au clavier puisse le faire défiler, il doit pouvoir prendre le focus
 * (règle WCAG « scrollable-region-focusable ») ; on lui donne donc un rôle de région nommée.
 * C'est la seule dérogation à la règle de lint : le motif est celui recommandé par les WCAG.
 */
export default function ZoneDefilante({ libelle, children }) {
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    <div className="tableau-defilant" tabIndex={0} role="region" aria-label={libelle}>
      {children}
    </div>
  );
}
