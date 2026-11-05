/** Fond assombri sous la barre quand le menu est ouvert : un tap dessus referme le menu (voir .menu-fond). */
export default function FondMenu({ surClic }) {
  return <div className="menu-fond" aria-hidden="true" onClick={surClic} />;
}
