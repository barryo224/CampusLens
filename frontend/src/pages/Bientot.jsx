import { usePageTitre } from '../lib/usePageTitre.js';

/** Page provisoire pour les écrans livrés dans la 2e moitié de la phase 5. */
export default function Bientot({ titre }) {
  usePageTitre(titre);
  return (
    <header className="page-titre">
      <h1>{titre}</h1>
      <p>Cette page arrive très bientôt.</p>
    </header>
  );
}
