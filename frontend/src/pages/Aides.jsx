import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import MessageErreur from '../components/MessageErreur.jsx';
import ZoneDefilante from '../components/ZoneDefilante.jsx';
import Fraicheur from '../components/Fraicheur.jsx';
import { useApi } from '../lib/useApi.js';
import { usePageTitre } from '../lib/usePageTitre.js';
import { formaterEuro } from '../lib/format.js';

const PROFILS = [
  { code: 'fr_ue', libelle: 'Étudiant français ou UE' },
  { code: 'boursier', libelle: 'Étudiant boursier' },
  { code: 'intl', libelle: 'Étudiant international hors UE' },
];
const BESOINS = [
  { code: '', libelle: 'Tous' },
  { code: 'logement', libelle: 'Logement' },
  { code: 'etudes', libelle: 'Études' },
  { code: 'urgence', libelle: 'Urgence' },
  { code: 'alimentation', libelle: 'Alimentation' },
];
const ONGLETS = [
  { code: 'aides', libelle: 'Aides financières' },
  { code: 'associations', libelle: 'Associations & entraide' },
  { code: 'villes', libelle: 'Comparateur de villes' },
];
const CLASSE_STATUT = { oui: 'badge-vert', sous_conditions: 'badge-orange', non: 'badge-gris' };
const LIBELLE_STATUT = {
  oui: 'Vous y avez droit',
  sous_conditions: 'Sous conditions',
  non: 'Non concerné',
};

const STOP = new Set(['sur', 'des', 'les', 'une', 'aux', 'du', 'de', 'la', 'le', 'au', 'et']);
const initiales = (nom) =>
  nom
    .replace(/\(.*\)/, '')
    .split(/\s+/)
    .filter((m) => m.length > 1 && !STOP.has(m.toLowerCase()))
    .slice(0, 2)
    .map((m) => m[0].toUpperCase())
    .join('');

function CarteAide({ aide }) {
  const [ouvert, setOuvert] = useState(false);
  const e = aide.eligibilite;
  const idPanneau = `demarche-${aide.slug}`;
  return (
    <li className="aide">
      <span className="aide-initiales" aria-hidden="true">
        {initiales(aide.nom)}
      </span>
      <div className="aide-corps">
        <h3>
          {aide.nom} <span className="aide-organisme">· {aide.organisme}</span>
        </h3>
        <p>{aide.description}</p>
      </div>
      {e && (
        <span className={`badge ${CLASSE_STATUT[e.statut]}`}>
          {e.precision ?? LIBELLE_STATUT[e.statut]}
        </span>
      )}
      <button
        type="button"
        className="bouton bouton-secondaire"
        aria-expanded={ouvert}
        aria-controls={idPanneau}
        onClick={() => setOuvert((o) => !o)}
      >
        {ouvert ? 'Masquer' : 'Comment l’obtenir'}
        <span className="sr-only"> : {aide.nom}</span>
      </button>
      {ouvert && (
        <div id={idPanneau} className="demarche">
          <h4>Comment la demander</h4>
          <p>{aide.commentDemander}</p>
          {aide.lienDemarche && (
            <p>
              <a href={aide.lienDemarche} target="_blank" rel="noopener noreferrer">
                Ouvrir le site officiel<span className="sr-only"> (nouvel onglet)</span>
              </a>
            </p>
          )}
          <Fraicheur source={aide.source} verifieLe={aide.verifieLe} aVerifier={aide.aVerifier} />
        </div>
      )}
    </li>
  );
}

function ListeAides({ profil, besoin }) {
  const chemin = `/aides?profil=${profil}${besoin ? `&categorie=${besoin}` : ''}`;
  const { data, erreur, chargement, recharger } = useApi(chemin);
  if (erreur) return <MessageErreur erreur={erreur} surReessayer={recharger} />;
  if (chargement || !data)
    return (
      <p className="message" role="status">
        Chargement des aides…
      </p>
    );

  const accessibles = data.filter((a) => a.eligibilite && a.eligibilite.statut !== 'non');
  const sousConditions = accessibles.filter(
    (a) => a.eligibilite.statut === 'sous_conditions',
  ).length;
  return (
    <div className="aides-layout">
      <p className="compteur" role="status">
        <strong>
          {accessibles.length} aide{accessibles.length > 1 ? 's' : ''}
        </strong>{' '}
        accessible
        {accessibles.length > 1 ? 's' : ''} pour votre profil, dont {sousConditions} sous condition
        {sousConditions > 1 ? 's' : ''}.
      </p>
      <h2 className="sr-only">Liste des aides</h2>
      {data.length === 0 ? (
        <p className="message">Aucune aide ne correspond à ce besoin pour le moment.</p>
      ) : (
        <ul className="liste-aides">
          {data.map((a) => (
            <CarteAide key={a.slug} aide={a} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Associations() {
  const { data, erreur, chargement, recharger } = useApi('/associations');
  if (erreur) return <MessageErreur erreur={erreur} surReessayer={recharger} />;
  if (chargement || !data)
    return (
      <p className="message" role="status">
        Chargement…
      </p>
    );
  if (data.length === 0)
    return <p className="message">Aucune association n’est référencée pour le moment.</p>;
  return (
    <>
      <h2 className="sr-only">Associations et entraide</h2>
      <ul className="grille grille-3" style={{ listStyle: 'none', padding: 0 }}>
        {data.map((a) => (
          <li key={a.id} className="carte">
            <h3>{a.nom}</h3>
            <p>{a.description}</p>
            {a.lien && (
              <p style={{ marginTop: 10 }}>
                <a href={a.lien} target="_blank" rel="noopener noreferrer">
                  Site de l’association<span className="sr-only"> (nouvel onglet)</span>
                </a>
              </p>
            )}
            <Fraicheur source={a.source} verifieLe={a.verifieLe} aVerifier={a.aVerifier} />
          </li>
        ))}
      </ul>
    </>
  );
}

function Villes() {
  const { data, erreur, chargement, recharger } = useApi('/villes');
  const [recherche, setRecherche] = useState('');
  if (erreur) return <MessageErreur erreur={erreur} surReessayer={recharger} />;
  if (chargement || !data)
    return (
      <p className="message" role="status">
        Chargement…
      </p>
    );
  if (data.length === 0) {
    return (
      <p className="message">
        Les villes sont mises à jour automatiquement depuis la carte des loyers et les données du
        CNOUS. Elles arriveront avec la prochaine synchronisation.
      </p>
    );
  }
  // Recherche sans tenir compte des accents ni des majuscules (« orleans » trouve « Orléans »).
  const simplifier = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const terme = simplifier(recherche.trim());
  const filtrees = data.filter(
    (v) => simplifier(v.nom).includes(terme) || simplifier(v.region).includes(terme),
  );
  const nombre = (n) => (n === null || n === undefined ? '—' : formaterEuro(n));
  return (
    <div>
      <div className="champ" style={{ maxWidth: 360 }}>
        <label htmlFor="recherche-ville">Rechercher une ville</label>
        <input
          id="recherche-ville"
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
      </div>
      <p className="aide-organisme" id="note-villes">
        {data.length} villes. Le loyer du studio est une estimation : loyer d’annonce au m² pour les
        appartements de 1 ou 2 pièces (carte des loyers officielle), multiplié par la surface type
        d’un studio. En résidence CROUS, les tarifs sont ceux publiés par les CROUS.
      </p>
      <ZoneDefilante libelle="Tableau du comparateur de villes">
        <table className="tableau">
          <caption className="sr-only">Comparateur de villes</caption>
          <thead>
            <tr>
              <th scope="col">Ville</th>
              <th scope="col">Loyer d’un studio (estimé)</th>
              <th scope="col">Résidences CROUS dans la commune</th>
              <th scope="col">Loyer en résidence CROUS</th>
              <th scope="col">Abonnement transport</th>
              <th scope="col">Source</th>
            </tr>
          </thead>
          <tbody>
            {filtrees.map((v) => (
              <tr key={v.id}>
                <th scope="row">
                  {v.nom} <span className="aide-organisme">{v.region}</span>
                </th>
                <td>{nombre(v.loyerStudioEstime)}</td>
                <td>{v.nbLogementsCrous ?? '—'}</td>
                <td>
                  {v.loyerCrousDesA === null || v.loyerCrousDesA === undefined
                    ? '—'
                    : `dès ${formaterEuro(v.loyerCrousDesA)}`}
                </td>
                <td>{nombre(v.abonnementTransport)}</td>
                <td>
                  <Fraicheur source={v.source} verifieLe={v.verifieLe} aVerifier={v.aVerifier} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ZoneDefilante>
    </div>
  );
}

export default function Aides() {
  usePageTitre('Mes aides');
  const [params, setParams] = useSearchParams();
  const profil = PROFILS.some((p) => p.code === params.get('profil'))
    ? params.get('profil')
    : 'fr_ue';
  const besoin = BESOINS.some((b) => b.code === params.get('besoin')) ? params.get('besoin') : '';
  const onglet = ONGLETS.some((o) => o.code === params.get('onglet'))
    ? params.get('onglet')
    : 'aides';

  const changer = (cle, valeur) => {
    const suivant = new URLSearchParams(params);
    if (valeur) suivant.set(cle, valeur);
    else suivant.delete(cle);
    setParams(suivant, { replace: true });
  };

  return (
    <>
      <header className="page-titre">
        <h1>Les aides auxquelles vous avez droit</h1>
        <p>
          Choisissez votre profil : chaque aide indique si vous y avez droit et comment la demander.
        </p>
      </header>

      <div role="tablist" aria-label="Types d’aides" className="onglets">
        {ONGLETS.map((o) => (
          <button
            key={o.code}
            type="button"
            role="tab"
            id={`onglet-${o.code}`}
            aria-selected={onglet === o.code}
            aria-controls="panneau-aides"
            tabIndex={onglet === o.code ? 0 : -1}
            onClick={() => changer('onglet', o.code === 'aides' ? '' : o.code)}
            onKeyDown={(e) => {
              // On part de l'onglet qui reçoit la touche (et non de l'état de la page, pas encore à jour si l'on appuie très vite).
              const i = ONGLETS.findIndex((x) => x.code === o.code);
              const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
              if (delta) {
                const cible = ONGLETS[(i + delta + ONGLETS.length) % ONGLETS.length];
                changer('onglet', cible.code === 'aides' ? '' : cible.code);
                document.getElementById(`onglet-${cible.code}`)?.focus();
              }
            }}
          >
            {o.libelle}
          </button>
        ))}
      </div>

      <div id="panneau-aides" role="tabpanel" aria-labelledby={`onglet-${onglet}`}>
        {onglet === 'aides' && (
          <div className="aides-page">
            <aside className="carte filtres" aria-label="Filtres">
              <fieldset className="groupe">
                <legend className="titre-carte">Mon profil</legend>
                {PROFILS.map((p) => (
                  <label key={p.code} className={`choix${profil === p.code ? ' choix-actif' : ''}`}>
                    <input
                      type="radio"
                      name="profil"
                      value={p.code}
                      checked={profil === p.code}
                      onChange={() => changer('profil', p.code)}
                    />
                    <span>{p.libelle}</span>
                  </label>
                ))}
              </fieldset>
              <div className="champ">
                <label htmlFor="besoin">Besoin</label>
                <select
                  id="besoin"
                  value={besoin}
                  onChange={(e) => changer('besoin', e.target.value)}
                >
                  {BESOINS.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.libelle}
                    </option>
                  ))}
                </select>
              </div>
            </aside>
            <div className="carte">
              <ListeAides profil={profil} besoin={besoin} />
            </div>
          </div>
        )}
        {onglet === 'associations' && <Associations />}
        {onglet === 'villes' && <Villes />}
      </div>
    </>
  );
}
