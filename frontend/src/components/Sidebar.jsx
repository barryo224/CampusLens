import { NavLink, Link } from 'react-router-dom';
import Icone from './Icone.jsx';
import Logo from './Logo.jsx';

const LIENS = [
  { vers: '/', libelle: 'Accueil', icone: 'accueil', fin: true },
  { vers: '/evaluer', libelle: 'Évaluer ma situation', icone: 'calcul' },
  { vers: '/aides', libelle: 'Mes aides', icone: 'ampoule' },
  { vers: '/budget', libelle: 'Préparer mon budget', icone: 'graphique' },
  { vers: '/ressources', libelle: 'Ressources', icone: 'livre' },
  { vers: '/a-propos', libelle: 'À propos', icone: 'info' },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <Link to="/" className="logo" aria-label="CampusLens, retour à l’accueil">
        <Logo />
        <span>CampusLens</span>
      </Link>
      <nav className="nav" aria-label="Navigation principale">
        {LIENS.map((l) => (
          <NavLink key={l.vers} to={l.vers} end={l.fin}>
            <Icone nom={l.icone} />
            {l.libelle}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-bas">
        <p className="sidebar-note">Gratuit, anonyme, sans inscription.</p>
        <p className="sidebar-copy">© 2026 CampusLens</p>
      </div>
    </aside>
  );
}
