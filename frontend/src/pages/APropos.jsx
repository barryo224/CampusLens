import Icone from '../components/Icone.jsx';
import Pied from '../components/Pied.jsx';
import { usePageTitre } from '../lib/usePageTitre.js';

const PRINCIPES = [
  {
    icone: 'document',
    titre: 'Informations fiables',
    texte: 'Basées sur des sources officielles : CROUS, CAF, ministère, service-public.fr.',
  },
  {
    icone: 'oeil',
    titre: 'Transparence',
    texte: 'Chaque chiffre et chaque aide indiquent leur source et leur date.',
  },
  {
    icone: 'cadenas',
    titre: 'Gratuit et anonyme',
    texte: 'Aucun compte à créer, aucune donnée personnelle enregistrée.',
  },
  {
    icone: 'check',
    titre: 'Utile',
    texte: 'Des outils concrets pour évaluer son budget et demander ses aides.',
  },
];

export default function APropos() {
  usePageTitre('À propos');
  return (
    <>
      <header className="page-titre">
        <h1>À propos</h1>
        <p>
          CampusLens aide les étudiants en France à évaluer leur budget et à découvrir les aides
          auxquelles ils ont droit.
        </p>
      </header>

      <section className="carte principes" aria-labelledby="titre-principes">
        <div className="principes-liste">
          <h2 id="titre-principes">Principes clés de la plateforme</h2>
          {PRINCIPES.map((p) => (
            <div key={p.titre} className="principe">
              <span className="pastille-icone" style={{ flex: 'none' }}>
                <Icone nom={p.icone} />
              </span>
              <div>
                <h3>{p.titre}</h3>
                <p>{p.texte}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mission">
          <small>Notre mission</small>
          <strong>
            Aider chaque étudiant à connaître ses droits et à garder le contrôle de son budget.
          </strong>
        </div>
      </section>

      <Pied />
    </>
  );
}
