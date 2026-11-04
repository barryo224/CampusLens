import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';

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
    </div>
  );
}
