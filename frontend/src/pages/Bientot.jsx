import { Link } from 'react-router-dom';
import { usePageTitre } from '../lib/usePageTitre.js';

/** Page affichée quand l'adresse demandée n'existe pas (404). */
export default function Bientot({ titre }) {
  usePageTitre(titre);
  return (
    <header className="page-titre">
      <h1>{titre}</h1>
      <p>Cette page n’existe pas ou a été déplacée.</p>
      <p>
        <Link to="/" className="bouton">
          Retour à l’accueil
        </Link>
      </p>
    </header>
  );
}
