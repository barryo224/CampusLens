import { Link } from 'react-router-dom';
import Icone from '../components/Icone.jsx';
import MessageErreur from '../components/MessageErreur.jsx';
import { useApi } from '../lib/useApi.js';
import { usePageTitre } from '../lib/usePageTitre.js';
import { PROFILS } from '../lib/profils.js';

const ICONE_CATEGORIE = {
  etudes: 'chapeau',
  logement: 'maison',
  urgence: 'coeur',
  alimentation: 'coeur',
};

const ETAPES = [
  {
    titre: 'Je renseigne mon profil',
    texte: 'Statut, niveau d’études, revenus et dépenses du mois. Rien n’est enregistré.',
  },
  {
    titre: 'J’évalue ma situation',
    texte:
      'Je découvre mon reste-à-vivre et si mon budget est équilibré, fragile ou en difficulté.',
  },
  {
    titre: 'Je demande mes aides',
    texte: 'Je vois les aides adaptées à mon profil et comment les obtenir, étape par étape.',
  },
];

function HeroVisuel() {
  // Illustration provisoire (la photo de la maquette sera ajoutée quand elle sera fournie).
  return (
    <svg
      viewBox="0 0 360 260"
      role="img"
      aria-label="Illustration : deux étudiants qui consultent un ordinateur"
    >
      <circle cx="180" cy="130" r="120" fill="#e3f0f2" />
      <circle cx="130" cy="95" r="26" fill="#0f4c5a" />
      <path d="M85 190c0-30 20-50 45-50s45 20 45 50z" fill="#0f4c5a" />
      <circle cx="235" cy="100" r="24" fill="#f59e0b" />
      <path d="M192 190c0-28 18-46 43-46s43 18 43 46z" fill="#f59e0b" />
      <rect
        x="140"
        y="160"
        width="90"
        height="56"
        rx="6"
        fill="#fff"
        stroke="#0f4c5a"
        strokeWidth="4"
      />
      <path
        d="M155 205l16-20 14 12 22-26 18 34"
        fill="none"
        stroke="#067647"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Accueil() {
  usePageTitre('Accueil');
  const { data: aides, erreur, chargement, recharger } = useApi('/aides?miseEnAvant=true');

  return (
    <>
      <section className="carte hero" aria-labelledby="titre-hero">
        <div className="hero-texte">
          <h1 id="titre-hero">
            Comprendre pour <span>agir ensemble.</span>
          </h1>
          <p>
            CampusLens aide chaque étudiant en France à évaluer son budget et à découvrir les aides
            auxquelles il a droit, simplement et gratuitement.
          </p>
          <div className="hero-actions">
            <Link to="/evaluer" className="bouton">
              Évaluer ma situation <Icone nom="fleche" taille={18} />
            </Link>
            <Link to="/aides" className="bouton bouton-secondaire">
              Découvrir mes aides
            </Link>
          </div>
        </div>
        <div className="hero-visuel">
          <HeroVisuel />
        </div>
      </section>

      <section aria-labelledby="titre-etapes">
        <h2 id="titre-etapes" className="titre-section">
          Comment ça marche ?
        </h2>
        <ol className="grille grille-3" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {ETAPES.map((etape, i) => (
            <li key={etape.titre} className="carte">
              <div className="etape-numero" aria-hidden="true">
                {i + 1}
              </div>
              <h3>{etape.titre}</h3>
              <p>{etape.texte}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="titre-aides">
        <h2 id="titre-aides" className="titre-section">
          Les aides à connaître absolument
          <Link to="/aides">
            Voir toutes les aides <span aria-hidden="true">→</span>
          </Link>
        </h2>
        {erreur && <MessageErreur erreur={erreur} surReessayer={recharger} />}
        {chargement && (
          <p className="message" role="status">
            Chargement des aides…
          </p>
        )}
        {aides && (
          <ul className="grille grille-4" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {aides.map((aide) => (
              <li key={aide.slug} className="carte aide-mise-en-avant">
                <span className="pastille-icone">
                  <Icone nom={ICONE_CATEGORIE[aide.categorie] ?? 'info'} />
                </span>
                <h3>{aide.nom}</h3>
                <p>{aide.description}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="carte" style={{ marginTop: 24 }} aria-labelledby="titre-profils">
        <h2 id="titre-profils" style={{ fontSize: '1.375rem' }}>
          Je suis…
        </h2>
        <p>Accédez directement aux aides et conseils qui vous concernent.</p>
        <div className="raccourcis">
          {PROFILS.map((p) => (
            <Link key={p.code} className="raccourci" to={`/aides?profil=${p.code}`}>
              {p.libelle} <Icone nom="fleche" taille={18} />
            </Link>
          ))}
        </div>
      </section>

      <section className="carte bon-a-savoir" style={{ marginTop: 24 }} aria-labelledby="titre-bas">
        <h2 id="titre-bas">Bon à savoir</h2>
        <ul className="bon-a-savoir-liste">
          <li>
            <p>
              <strong>Boursier ?</strong> Vous ne payez ni les droits d’inscription, ni la CVEC.
            </p>
          </li>
          <li>
            <p>
              <strong>Pas de garant ?</strong> Demandez Visale avant de signer votre bail.
            </p>
          </li>
          <li>
            <p>
              <strong>Étudiant hors UE ?</strong> Vous pouvez demander une exonération des droits à
              votre université.
            </p>
          </li>
        </ul>
      </section>
    </>
  );
}
