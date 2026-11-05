import { Link } from 'react-router-dom';
import Icone from '../components/Icone.jsx';
import LienExterne from '../components/LienExterne.jsx';
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
    texte:
      'Des repères pour s’informer, comparer les villes, évaluer son budget et demander ses aides.',
  },
];

// D'où vient chaque famille d'informations (liens vers les pages officielles).
const SOURCES = [
  {
    sujet: 'Droits d’inscription, bourses, APL, Visale, aide spécifique, visa et titre de séjour',
    organisme: 'Service-Public.fr',
    url: 'https://www.service-public.gouv.fr',
  },
  {
    sujet: 'Contribution de vie étudiante et de campus (CVEC)',
    organisme: 'cvec.etudiant.gouv.fr',
    url: 'https://cvec.etudiant.gouv.fr',
  },
  {
    sujet: 'Résidences et loyers des Crous, restauration universitaire',
    organisme: 'Crous et données ouvertes du ministère',
    url: 'https://www.lescrous.fr',
  },
  {
    sujet: 'Loyers d’annonce par commune',
    organisme: 'Carte des loyers (ministère du Logement, ANIL) sur data.gouv.fr',
    url: 'https://www.data.gouv.fr/datasets/carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025',
  },
  {
    sujet: 'Estimation facultative de l’aide au logement',
    organisme: 'OpenFisca, moteur de calcul public',
    url: 'https://openfisca.org/fr',
  },
  {
    sujet: 'Travail et études des étudiants étrangers',
    organisme: 'Campus France',
    url: 'https://www.campusfrance.org/fr',
  },
  {
    sujet: 'Abonnements de transport',
    organisme: 'La page tarifaire de chaque réseau (lien indiqué à côté de chaque prix)',
    url: null,
  },
];

export default function APropos() {
  usePageTitre('À propos');
  return (
    <>
      <header className="page-titre">
        <h1>À propos</h1>
        <p>
          CampusLens aide les étudiants en France à comprendre leurs droits, à découvrir les aides
          et les démarches utiles, et à évaluer leur budget.
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
            Aider chaque étudiant à connaître ses droits, à s’informer et à garder le contrôle de
            son budget.
          </strong>
        </div>
      </section>

      <section className="carte" style={{ marginTop: 16 }} aria-labelledby="titre-sources">
        <h2 id="titre-sources" className="titre-carte">
          D’où viennent les informations
        </h2>
        <p>
          Aucun chiffre n’est inventé ni recopié d’un blog : chaque information vient d’une page
          officielle, que vous pouvez ouvrir pour la comparer.
        </p>
        <ul className="liste-sources">
          {SOURCES.map((x) => (
            <li key={x.sujet}>
              <span>{x.sujet}</span>
              <strong>
                {x.url ? <LienExterne href={x.url}>{x.organisme}</LienExterne> : x.organisme}
              </strong>
            </li>
          ))}
        </ul>
      </section>

      <div className="grille grille-2" style={{ marginTop: 16 }}>
        <section className="carte" aria-labelledby="titre-maj">
          <h2 id="titre-maj" className="titre-carte">
            Comment les informations restent à jour
          </h2>
          <ul className="liste-points">
            <li>
              <strong>Chaque jour ou chaque semaine</strong>, des robots relisent les sources
              officielles : loyers par ville, résidences Crous, pages de Service-Public, tarifs des
              réseaux de transport.
            </li>
            <li>
              <strong>Quand une page change</strong>, le site le signale. Pour les montants
              réglementaires (droits d’inscription, CVEC, aides, tarifs de transport), une personne
              compare avec la source avant de les modifier.
            </li>
            <li>
              <strong>Chaque année</strong>, l’année universitaire suivante est préparée à l’avance
              et le site bascule seul au 1er septembre, avec les montants à revérifier.
            </li>
          </ul>
        </section>

        <section className="carte" aria-labelledby="titre-verif">
          <h2 id="titre-verif" className="titre-carte">
            Que veut dire « vérification en cours » ?
          </h2>
          <p>
            Cette mention apparaît à côté d’une information que nous n’avons pas encore comparée à
            sa source officielle, ou dont la source a changé depuis notre dernière vérification.
          </p>
          <p>
            Elle ne veut pas dire que le chiffre est faux : elle veut dire que nous ne le
            garantissons pas encore. Quand la vérification est faite, la mention disparaît et la
            date apparaît à côté de la source. Dans le doute, ouvrez le lien vers la source
            officielle.
          </p>
        </section>
      </div>

      <div className="grille grille-2" style={{ marginTop: 16 }}>
        <section className="carte" aria-labelledby="titre-donnees">
          <h2 id="titre-donnees" className="titre-carte">
            Vos données et votre anonymat
          </h2>
          <ul className="liste-points">
            <li>
              <strong>Vos montants restent chez vous.</strong> Le calcul du reste-à-vivre se fait
              dans votre navigateur : rien n’est envoyé ni enregistré.
            </li>
            <li>
              <strong>Pas de compte, pas de suivi.</strong> Aucun cookie n’est déposé aux visiteurs
              et aucun outil de suivi publicitaire n’est utilisé.
            </li>
            <li>
              <strong>L’estimation de l’aide au logement est facultative.</strong> Si vous la
              demandez, vos informations passent par notre serveur jusqu’au moteur de calcul public,
              sans être enregistrées ni conservées.
            </li>
            <li>
              <strong>Vos avis sont anonymes</strong> (ni nom, ni e-mail, ni adresse IP) ; un
              message envoyé par le formulaire de contact est supprimé au bout de 6 mois. Détails
              dans les <Link to="/mentions-legales">mentions légales</Link>.
            </li>
          </ul>
        </section>

        <section className="carte" aria-labelledby="titre-limites">
          <h2 id="titre-limites" className="titre-carte">
            Les limites à connaître
          </h2>
          <ul className="liste-points">
            <li>
              <strong>Les résultats sont indicatifs.</strong> CampusLens ne remplace ni le Crous, ni
              la CAF, ni un service social : eux seuls décident de vos droits.
            </li>
            <li>
              <strong>Les loyers sont des estimations</strong> tirées des annonces, un repère pour
              comparer les villes et non un prix garanti.
            </li>
            <li>
              <strong>Tout n’est pas encore renseigné partout.</strong> Un tiret « — » signifie que
              nous n’avons pas trouvé d’information officielle fiable : nous préférons ne rien
              afficher plutôt qu’un chiffre inventé.
            </li>
            <li>
              <strong>Les règles changent</strong> (montants, conditions, dates). Vérifiez toujours
              auprès de l’organisme avant de faire une démarche.
            </li>
          </ul>
        </section>
      </div>

      <section
        className="carte appel-a-propos"
        style={{ marginTop: 16 }}
        aria-labelledby="titre-qui"
      >
        <h2 id="titre-qui" className="titre-carte">
          Qui est derrière CampusLens
        </h2>
        <p>
          CampusLens est un service indépendant et gratuit, sans publicité ni création de compte.
          Responsable de la publication : Ousmane Barry.
        </p>
        <p>Une erreur à signaler, une question, une idée ? Votre retour nous aide à progresser.</p>
        <div className="resultat-actions" style={{ gridTemplateColumns: 'repeat(2, auto)' }}>
          <Link to="/contact" className="bouton">
            Nous écrire
          </Link>
          <Link to="/avis?page=a_propos" className="bouton bouton-secondaire">
            Donner mon avis
          </Link>
        </div>
      </section>
    </>
  );
}
