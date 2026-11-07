import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import MessageErreur from '../components/MessageErreur.jsx';
import TableauAdaptatif from '../components/TableauAdaptatif.jsx';
import RechercheCollante from '../components/RechercheCollante.jsx';
import { useRemonterSurResultats } from '../lib/useRemonterSurResultats.js';
import Fraicheur from '../components/Fraicheur.jsx';
import { useApi } from '../lib/useApi.js';
import { usePageTitre } from '../lib/usePageTitre.js';
import { formaterEuro, formaterEuroCentimes } from '../lib/format.js';
import { rechercherVilles } from '../lib/rechercheVilles.js';
import ChampVille from '../components/ChampVille.jsx';
import LienExterne from '../components/LienExterne.jsx';

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
      {/* Étiquette et bouton passent SOUS le texte : le nom et la description gardent toute la largeur. */}
      <div className="aide-actions">
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
      </div>
      {ouvert && (
        <div id={idPanneau} className="demarche">
          <h4>Comment la demander</h4>
          <p>{aide.commentDemander}</p>
          {aide.lienDemarche && (
            <p>
              <LienExterne href={aide.lienDemarche}>Ouvrir le site officiel</LienExterne>
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
                <LienExterne href={a.lien}>Site de l’association</LienExterne>
              </p>
            )}
            <Fraicheur source={a.source} verifieLe={a.verifieLe} aVerifier={a.aVerifier} />
          </li>
        ))}
      </ul>
    </>
  );
}

/** Nombre de villes affichées d'un coup (puis « Afficher plus ») : la page reste agréable à parcourir. */
const PAQUET_VILLES = 24;

function Villes() {
  const { data, erreur, chargement, recharger } = useApi('/villes');
  const [recherche, setRecherche] = useState('');
  const [choix, setChoix] = useState(null); // ville touchée dans les suggestions : on n'affiche qu'elle
  const [visibles, setVisibles] = useState(PAQUET_VILLES);
  useRemonterSurResultats('resultats-villes', recherche, choix); // une nouvelle recherche ramène au début des résultats // la liste s'allonge par paquets : la page ne devient pas interminable
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
  const filtrees = choix ? data.filter((v) => v.id === choix) : rechercherVilles(data, recherche);
  const affichees = filtrees.slice(0, visibles);
  const restantes = filtrees.length - affichees.length;
  const nombre = (n) => (n === null || n === undefined ? '—' : formaterEuro(n));
  return (
    <div>
      <RechercheCollante>
        <ChampVille
          villes={data}
          valeur={recherche}
          idResultats="resultats-villes"
          surChangement={(texte) => {
            setRecherche(texte);
            setChoix(null);
            setVisibles(PAQUET_VILLES);
          }}
          surChoix={(ville) => {
            setRecherche(ville.nom);
            setChoix(ville.id);
            setVisibles(PAQUET_VILLES);
          }}
        />
      </RechercheCollante>
      <p className="aide-organisme" id="note-villes">
        {data.length} villes. Le loyer du studio est une estimation : loyer d’annonce au m² pour les
        appartements de 1 ou 2 pièces (carte des loyers officielle), multiplié par la surface type
        d’un studio. En résidence CROUS, les tarifs sont ceux publiés par les CROUS. Les abonnements
        de transport sont relevés sur la page officielle de chaque réseau, ville après ville (« — »
        : pas encore relevé).
      </p>
      <div id="resultats-villes" className="resultats-villes">
        <TableauAdaptatif libelle="Tableau du comparateur de villes" seuil={900} sousRecherche>
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
              {affichees.map((v) => (
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
                  <td>
                    {v.transport ? (
                      <>
                        {formaterEuroCentimes(v.abonnementTransport)} / mois
                        {/* Nature du tarif : réservé aux étudiants, ou tarif « jeunes » (selon l'âge seulement). */}
                        <span
                          className={`badge type-tarif ${v.transport.typeTarif === 'etudiant' ? 'badge-vert' : 'badge-gris'}`}
                          data-testid="type-tarif"
                        >
                          {v.transport.typeTarif === 'etudiant'
                            ? 'Tarif étudiant'
                            : 'Tarif jeunes, sans condition d’études'}
                        </span>
                        <span className="aide-organisme">
                          {v.transport.reseau} — {v.transport.libelle} (
                          {v.transport.montantAnnuel === null ||
                          v.transport.montantAnnuel === undefined
                            ? 'abonnement mensuel'
                            : v.transport.montantMensuel
                              ? `pass mensuel ; ${formaterEuroCentimes(v.transport.montantAnnuel)} par an en annuel`
                              : `${formaterEuroCentimes(v.transport.montantAnnuel)} par an`}
                          ) ·{' '}
                          <LienExterne href={v.transport.urlTarifs}>tarifs officiels</LienExterne>
                        </span>
                        <Fraicheur
                          source={v.transport.source}
                          verifieLe={v.transport.verifieLe}
                          aVerifier={v.transport.aVerifier}
                        />
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <Fraicheur source={v.source} verifieLe={v.verifieLe} aVerifier={v.aVerifier} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableauAdaptatif>
      </div>
      {restantes > 0 && (
        <div className="plus-de-villes">
          {/* aria-live (et non role="status") : annoncé aux lecteurs d'écran sans faire défiler la page vers ce texte. */}
          <p className="fraicheur" aria-live="polite">
            {affichees.length} villes affichées sur {filtrees.length}.
          </p>
          <button
            type="button"
            className="bouton bouton-secondaire"
            onClick={() => setVisibles((n) => n + PAQUET_VILLES)}
          >
            Afficher {Math.min(PAQUET_VILLES, restantes)} villes de plus
          </button>
          <button
            type="button"
            className="lien-action"
            onClick={() => setVisibles(filtrees.length)}
          >
            Tout afficher ({filtrees.length})
          </button>
        </div>
      )}
      {filtrees.length === 0 && (
        <p className="message" role="status">
          Aucune ville ne correspond à « {recherche.trim()} ». Essayez le nom d’une ville, un code
          postal, un département ou une région.
        </p>
      )}
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
        <h1>Aides, entraide et villes</h1>
        <p>
          Choisissez votre profil : chaque aide indique si elle peut vous concerner et comment la
          demander. Découvrez aussi les associations d’entraide et comparez les villes.
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
                      autoComplete="off"
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
                  autoComplete="off"
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
