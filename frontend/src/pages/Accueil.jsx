import { Link } from 'react-router-dom';
import Icone from '../components/Icone.jsx';
import MessageErreur from '../components/MessageErreur.jsx';
import { useApi } from '../lib/useApi.js';
import { usePageTitre } from '../lib/usePageTitre.js';
import { PROFILS } from '../lib/profils.js';
import photoGrande from '../assets/hero-1600.webp';
import photoMoyenne from '../assets/hero-900.webp';

const ICONE_CATEGORIE = {
  etudes: 'chapeau',
  logement: 'maison',
  urgence: 'coeur',
  alimentation: 'coeur',
};

// Trois façons d'utiliser le site : on peut commencer par n'importe laquelle.
const ETAPES = [
  {
    titre: 'Je m’informe',
    texte:
      'Je découvre mes droits : les aides adaptées à mon profil, comment les obtenir, et les guides officiels.',
    lien: { vers: '/aides', libelle: 'Découvrir les aides' },
  },
  {
    titre: 'J’explore les villes',
    texte:
      'Je compare loyers, résidences Crous et abonnements de transport pour choisir où étudier.',
    lien: { vers: '/aides?onglet=villes', libelle: 'Comparer les villes' },
  },
  {
    titre: 'J’évalue mon budget',
    texte:
      'Je calcule mon reste-à-vivre du mois et je prépare les frais de la rentrée. Rien n’est enregistré.',
    lien: { vers: '/evaluer', libelle: 'Évaluer ma situation' },
  },
];

export default function Accueil() {
  usePageTitre('Accueil');
  const { data: aides, erreur, chargement, recharger } = useApi('/aides?miseEnAvant=true');

  return (
    <>
      <div className="hero-cadre">
        <section className="hero" aria-labelledby="titre-hero">
          <div className="hero-photo">
            {/* Photo du bandeau : chargée en priorité (c'est le plus gros élément visible). */}
            <img
              src={photoGrande}
              srcSet={`${photoMoyenne} 900w, ${photoGrande} 1600w`}
              sizes="(max-width: 900px) 100vw, 1700px"
              width="1600"
              height="1067"
              alt="Trois étudiants souriants assis sur la pelouse d’un campus, qui lisent et travaillent sur un ordinateur"
              fetchPriority="high"
              decoding="async"
            />
          </div>
          <div className="hero-contenu">
            <div className="hero-haut">
              <p className="hero-accroche">Comprendre pour agir ensemble</p>
              <h1 id="titre-hero">Les repères pour bien vivre ses études en France</h1>
            </div>
            <div className="hero-bas">
              <p className="hero-description">
                CampusLens aide chaque étudiant en France à comprendre ses droits, à découvrir les
                aides, les villes et les démarches utiles, et à évaluer son budget, simplement et
                gratuitement.
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
          </div>
        </section>
      </div>

      <section aria-labelledby="titre-etapes">
        <h2 id="titre-etapes" className="titre-section">
          Que voulez-vous faire ?
        </h2>
        <ol className="grille grille-3" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {ETAPES.map((etape, i) => (
            <li key={etape.titre} className="carte">
              <div className="etape-numero" aria-hidden="true">
                {i + 1}
              </div>
              <h3>{etape.titre}</h3>
              <p>{etape.texte}</p>
              <Link to={etape.lien.vers} className="lien-etape">
                {etape.lien.libelle} <span aria-hidden="true">→</span>
              </Link>
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
