import Icone from '../components/Icone.jsx';
import Pied from '../components/Pied.jsx';
import { usePageTitre } from '../lib/usePageTitre.js';
import photoMission from '../assets/mission-etudiants.webp';

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
          {/* Photo décorative, très atténuée (voir --mission-image-opacite) pour que le texte reste lisible. */}
          <img
            className="mission-photo"
            src={photoMission}
            width="1100"
            height="734"
            alt=""
            loading="lazy"
            decoding="async"
          />
          <small>Notre mission</small>
          <strong>
            Aider chaque étudiant à connaître ses droits et à garder le contrôle de son budget.
          </strong>
        </div>
      </section>

      <p className="fraicheur credit-photo">
        Photo de la page d’accueil : fournie par l’équipe. Photo de la mission : RDNE Stock project,
        via{' '}
        <a
          href="https://www.pexels.com/photo/college-students-studying-together-7683734/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Pexels<span className="sr-only"> (nouvel onglet)</span>
        </a>
        .
      </p>

      <Pied />
    </>
  );
}
