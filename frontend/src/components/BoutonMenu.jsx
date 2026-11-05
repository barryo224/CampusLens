/** Bouton « trois tirets » : visible seulement sur téléphone et tablette (voir .menu-bouton dans global.css). */
export default function BoutonMenu({ ouvert, surClic, controle, signal = false }) {
  return (
    <button
      type="button"
      className="menu-bouton"
      aria-expanded={ouvert}
      aria-controls={controle}
      onClick={surClic}
    >
      <span className="menu-barres" aria-hidden="true" />
      {/* Point orange : quelque chose attend dans le menu replié (ex. des messages non lus). */}
      {signal && !ouvert && <span className="menu-pastille" aria-hidden="true" />}
      <span className="sr-only">{ouvert ? 'Fermer le menu' : 'Ouvrir le menu'}</span>
    </button>
  );
}
