import { Link } from 'react-router-dom';

export default function Pied() {
  return (
    <footer className="pied">
      <div>
        <h2>CampusLens</h2>
        <p>Connaître ses droits, maîtriser son budget.</p>
      </div>
      <div>
        <h2>Liens utiles</h2>
        <ul>
          <li>
            <Link to="/ressources">Ressources</Link>
          </li>
          <li>
            <Link to="/aides">Mes aides</Link>
          </li>
          <li>
            <Link to="/contact">Contact</Link>
          </li>
          <li>
            <Link to="/mentions-legales">Mentions légales et confidentialité</Link>
          </li>
        </ul>
      </div>
      <div>
        <h2>Nos engagements</h2>
        <ul className="pied-engagements">
          <li>Gratuit, anonyme, sans inscription</li>
          <li>Informations issues de sources officielles</li>
          <li>Aucune donnée personnelle conservée</li>
        </ul>
        <p className="pied-droits">© 2026 CampusLens</p>
      </div>
    </footer>
  );
}
