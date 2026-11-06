/**
 * Conteneur d'un tableau large : il défile horizontalement sur petit écran.
 * Pour qu'un utilisateur au clavier puisse le faire défiler, il doit pouvoir prendre le focus
 * (règle WCAG « scrollable-region-focusable ») ; on lui donne donc un rôle de région nommée.
 * C'est la seule dérogation à la règle de lint : le motif est celui recommandé par les WCAG.
 */
export default function ZoneDefilante({ libelle, children }) {
  return (
    <>
      {/* Indication visuelle pour le doigt (les barres de défilement des téléphones se cachent d'elles-mêmes). */}
      <p className="aide-defilement" aria-hidden="true">
        ↔ Faites glisser le tableau pour voir toutes les colonnes
      </p>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div className="tableau-defilant" tabIndex={0} role="region" aria-label={libelle}>
        {children}
      </div>
    </>
  );
}
