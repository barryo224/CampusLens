import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Pied from './Pied.jsx';

/** Mise en page de toutes les pages publiques : menu latéral, contenu, et UN SEUL pied de page commun. */
export default function Layout() {
  return (
    <div className="app">
      <a className="lien-evitement" href="#contenu">
        Aller au contenu
      </a>
      <Sidebar />
      <main id="contenu" className="contenu" tabIndex={-1}>
        <Outlet />
      </main>
      <div className="contenu-pied">
        <Pied />
      </div>
    </div>
  );
}
