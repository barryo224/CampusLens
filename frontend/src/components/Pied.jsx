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
        <h2>Le projet</h2>
        <p>Projet étudiant · Licence MIASHS</p>
        <p>© 2026 CampusLens</p>
      </div>
      <p className="pied-credit">
        Photos du bandeau d’accueil et de la page À propos :{' '}
        <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer">
          Pexels<span className="sr-only"> (nouvel onglet)</span>
        </a>
        , licence libre. Données publiques : CROUS, CAF, ministère, service-public.fr.
      </p>
    </footer>
  );
}
