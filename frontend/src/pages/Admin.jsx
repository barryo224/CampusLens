import { useEffect, useState } from 'react';
import MessageErreur from '../components/MessageErreur.jsx';
import { get, post, ErreurApi } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { usePageTitre } from '../lib/usePageTitre.js';
import { formaterDateHeure } from '../lib/format.js';

const LIBELLE_STATUT_SOURCE = { ok: 'À jour', a_verifier: 'À vérifier', erreur: 'En erreur' };
const CLASSE_STATUT_SOURCE = {
  ok: 'badge-vert',
  a_verifier: 'badge-orange',
  erreur: 'badge-rouge-clair',
};
const LIBELLE_SYNC = {
  succes: 'Réussie',
  aucun_changement: 'Aucun changement',
  en_attente_validation: 'En attente de validation',
  echec: 'Échec',
  en_cours: 'En cours',
};
const LIBELLE_PARAM = {
  droits_inscription: 'Droits d’inscription',
  cvec: 'CVEC',
  seuil_fragile: 'Seuil « fragile »',
  seuil_part_loyer: 'Seuil part du loyer',
  surface_studio_m2: 'Surface type d’un studio',
  heures_travail_max: 'Heures de travail max',
};
const nomParametre = (p) =>
  `${LIBELLE_PARAM[p.cle] ?? p.cle}${p.niveau !== 'aucun' ? ` (${p.niveau})` : ''}${p.profil ? ` — ${p.profil}` : ''}`;

function Connexion({ surConnecte }) {
  const [champs, setChamps] = useState({ email: '', motDePasse: '' });
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  async function envoyer(e) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      surConnecte(await post('/admin/login', champs));
    } catch (err) {
      setErreur(
        err.status === 429 ? 'Trop de tentatives. Réessayez dans quelques minutes.' : err.message,
      );
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <section className="carte" style={{ maxWidth: 440 }} aria-labelledby="titre-connexion">
      <h2 id="titre-connexion" className="titre-carte">
        Connexion
      </h2>
      {erreur && (
        <p className="message message-erreur" role="alert">
          {erreur}
        </p>
      )}
      <form onSubmit={envoyer}>
        <div className="champ">
          <label htmlFor="admin-email">Adresse e-mail</label>
          <input
            id="admin-email"
            type="email"
            required
            autoComplete="username"
            value={champs.email}
            onChange={(e) => setChamps({ ...champs, email: e.target.value })}
          />
        </div>
        <div className="champ">
          <label htmlFor="admin-mdp">Mot de passe</label>
          <input
            id="admin-mdp"
            type="password"
            required
            autoComplete="current-password"
            value={champs.motDePasse}
            onChange={(e) => setChamps({ ...champs, motDePasse: e.target.value })}
          />
        </div>
        <button type="submit" className="bouton" disabled={envoi}>
          {envoi ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </section>
  );
}

function CarteChangement({ changement, surTraite }) {
  const suggestions = new Map(changement.suggestions.map((s) => [s.parametreId, s.valeur]));
  const [valeurs, setValeurs] = useState(() =>
    Object.fromEntries(
      changement.parametres.map((p) => [p.id, String(suggestions.get(p.id) ?? p.valeur)]),
    ),
  );
  const [etat, setEtat] = useState({ envoi: false, erreur: null });

  async function agir(action) {
    setEtat({ envoi: true, erreur: null });
    try {
      const corps =
        action === 'valider'
          ? {
              // On n'envoie que ce que l'administrateur a réellement changé par rapport à la base.
              valeurs: changement.parametres
                .filter((p) => Number(valeurs[p.id].replace(',', '.')) !== p.valeur)
                .map((p) => ({
                  parametreId: p.id,
                  valeur: Number(valeurs[p.id].replace(',', '.')),
                })),
            }
          : {};
      await post(`/admin/changements/${changement.id}/${action}`, corps);
      surTraite();
    } catch (err) {
      setEtat({ envoi: false, erreur: err.message });
    }
  }
  const invalide = changement.parametres.some((p) => !/^\d+([.,]\d+)?$/.test(valeurs[p.id].trim()));

  return (
    <li className="carte changement">
      <h3>{changement.source.nom}</h3>
      <p>{changement.resume}</p>
      <p>
        <a href={changement.source.url} target="_blank" rel="noopener noreferrer">
          Ouvrir la page officielle<span className="sr-only"> (nouvel onglet)</span>
        </a>
      </p>
      {changement.parametres.length > 0 && (
        <fieldset className="groupe">
          <legend>Valeurs de cette source (année en cours) — corrigez si besoin</legend>
          {changement.parametres.map((p) => {
            const propose = suggestions.get(p.id);
            return (
              <div key={p.id} className="champ champ-ligne">
                <label htmlFor={`val-${changement.id}-${p.id}`}>{nomParametre(p)}</label>
                <input
                  id={`val-${changement.id}-${p.id}`}
                  inputMode="decimal"
                  value={valeurs[p.id]}
                  onChange={(e) => setValeurs({ ...valeurs, [p.id]: e.target.value })}
                />
                <span className="fraicheur">
                  actuelle : {p.valeur} {p.unite}
                  {propose !== undefined && propose !== p.valeur && (
                    <span className="a-verifier">proposée : {propose}</span>
                  )}
                </span>
              </div>
            );
          })}
        </fieldset>
      )}
      {etat.erreur && (
        <p className="message message-erreur" role="alert">
          {etat.erreur}
        </p>
      )}
      <div
        className="resultat-actions"
        style={{ gridTemplateColumns: 'auto auto', justifyContent: 'start' }}
      >
        <button
          type="button"
          className="bouton"
          disabled={etat.envoi || invalide}
          onClick={() => agir('valider')}
        >
          Valider<span className="sr-only"> : {changement.source.nom}</span>
        </button>
        <button
          type="button"
          className="bouton bouton-secondaire"
          disabled={etat.envoi}
          onClick={() => agir('rejeter')}
        >
          Rejeter<span className="sr-only"> : {changement.source.nom}</span>
        </button>
      </div>
    </li>
  );
}

function Changements() {
  const { data, erreur, chargement, recharger } = useApi('/admin/changements');
  if (erreur) return <MessageErreur erreur={erreur} surReessayer={recharger} />;
  if (chargement || !data)
    return (
      <p className="message" role="status">
        Chargement…
      </p>
    );
  if (data.length === 0)
    return (
      <p className="message">
        Aucun changement à valider. Les robots n’ont rien détecté de nouveau.
      </p>
    );
  return (
    <>
      <h2 className="sr-only">Changements à valider</h2>
      <ul className="grille" style={{ listStyle: 'none', padding: 0 }}>
        {data.map((c) => (
          <CarteChangement key={c.id} changement={c} surTraite={recharger} />
        ))}
      </ul>
    </>
  );
}

function Sources({ role }) {
  const { data, erreur, chargement, recharger } = useApi('/admin/sources');
  const [message, setMessage] = useState(null);
  if (erreur) return <MessageErreur erreur={erreur} surReessayer={recharger} />;
  if (chargement || !data)
    return (
      <p className="message" role="status">
        Chargement…
      </p>
    );

  async function lancer(s) {
    setMessage(null);
    try {
      const r = await post(`/admin/sources/${s.id}/synchroniser`, {});
      setMessage(
        `${s.nom} : ${LIBELLE_SYNC[r.statut] ?? r.statut}${r.message ? ` — ${r.message}` : ''}`,
      );
      recharger();
    } catch (err) {
      setMessage(err.message);
    }
  }
  return (
    <>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
      <div className="tableau-defilant">
        <table className="tableau">
          <caption className="sr-only">État des sources de données</caption>
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Niveau</th>
              <th scope="col">Statut</th>
              <th scope="col">Dernier contrôle</th>
              <th scope="col">Fréquence</th>
              <th scope="col">Dernier passage</th>
              <th scope="col">À valider</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.id}>
                <th scope="row">
                  {s.nom}
                  <br />
                  <span className="aide-organisme">{s.organisme}</span>
                </th>
                <td>{s.robot ? s.niveau : '—'}</td>
                <td>
                  <span className={`badge ${CLASSE_STATUT_SOURCE[s.statut]}`}>
                    {LIBELLE_STATUT_SOURCE[s.statut]}
                  </span>
                  {!s.robot && (
                    <span className="fraicheur">
                      <br />
                      Pas de robot
                    </span>
                  )}
                </td>
                <td>{formaterDateHeure(s.dernierControle)}</td>
                <td>{s.frequenceHeures} h</td>
                <td>
                  {s.derniereSynchronisation ? (
                    <>
                      {LIBELLE_SYNC[s.derniereSynchronisation.statut]}
                      {s.derniereSynchronisation.messageErreur && (
                        <span className="fraicheur">
                          <br />
                          {s.derniereSynchronisation.messageErreur}
                        </span>
                      )}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td>{s.changementsEnAttente}</td>
                <td>
                  {s.robot && role === 'admin' ? (
                    <button
                      type="button"
                      className="bouton bouton-secondaire"
                      onClick={() => lancer(s)}
                    >
                      Lancer<span className="sr-only"> : {s.nom}</span>
                    </button>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Historique({ role }) {
  const { data, erreur, chargement, recharger } = useApi('/admin/historique');
  const [message, setMessage] = useState(null);
  if (erreur) return <MessageErreur erreur={erreur} surReessayer={recharger} />;
  if (chargement || !data)
    return (
      <p className="message" role="status">
        Chargement…
      </p>
    );

  async function annuler(h) {
    setMessage(null);
    try {
      const r = await post(`/admin/historique/${h.id}/annuler`, {});
      setMessage(`Valeur restaurée : ${r.restauree}.`);
      recharger();
    } catch (err) {
      setMessage(err.message);
    }
  }
  if (data.length === 0)
    return <p className="message">Aucune modification enregistrée pour l’instant.</p>;
  return (
    <>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
      <div className="tableau-defilant">
        <table className="tableau">
          <caption className="sr-only">Dernières modifications de données</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Donnée</th>
              <th scope="col">Ancienne valeur</th>
              <th scope="col">Nouvelle valeur</th>
              <th scope="col">Origine</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {data.map((h) => (
              <tr key={h.id}>
                <td>{formaterDateHeure(h.changeLe)}</td>
                <th scope="row">
                  {h.tableCible} #{h.ligneId} · {h.champ}
                </th>
                <td>{h.ancienneValeur ?? '—'}</td>
                <td>{h.nouvelleValeur ?? '—'}</td>
                <td>{h.synchronisationId ? `Robot (passage ${h.synchronisationId})` : 'Manuel'}</td>
                <td>
                  {role === 'admin' ? (
                    <button
                      type="button"
                      className="bouton bouton-secondaire"
                      onClick={() => annuler(h)}
                    >
                      Annuler<span className="sr-only"> la modification {h.id}</span>
                    </button>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const ONGLETS = [
  { code: 'changements', libelle: 'À valider' },
  { code: 'sources', libelle: 'État des sources' },
  { code: 'historique', libelle: 'Historique' },
];

export default function Admin() {
  usePageTitre('Espace administration');
  const [admin, setAdmin] = useState(undefined); // undefined = on vérifie ; null = non connecté
  const [onglet, setOnglet] = useState('changements');
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    // Page non publique : on demande aux moteurs de recherche de ne pas l'indexer.
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  useEffect(() => {
    get('/admin/me')
      .then(setAdmin)
      .catch((e) => {
        if (e instanceof ErreurApi && e.status === 401) setAdmin(null);
        else {
          setAdmin(null);
          setErreur(e);
        }
      });
  }, []);

  async function deconnecter() {
    try {
      await post('/admin/logout', {});
    } finally {
      setAdmin(null);
    }
  }

  return (
    <>
      <header className="page-titre">
        <h1>Espace administration</h1>
        <p>
          Validez les changements détectés sur les sources officielles et surveillez l’état des
          robots.
        </p>
      </header>
      {admin === undefined && (
        <p className="message" role="status">
          Vérification de la session…
        </p>
      )}
      {erreur && <MessageErreur erreur={erreur} />}
      {admin === null && <Connexion surConnecte={setAdmin} />}
      {admin && (
        <>
          <p className="barre-admin">
            Connecté : <strong>{admin.email}</strong> ({admin.role})
            <button type="button" className="bouton bouton-secondaire" onClick={deconnecter}>
              Se déconnecter
            </button>
          </p>
          <div role="tablist" aria-label="Sections de l’administration" className="onglets">
            {ONGLETS.map((o) => (
              <button
                key={o.code}
                type="button"
                role="tab"
                id={`adm-${o.code}`}
                aria-selected={onglet === o.code}
                aria-controls="adm-panneau"
                tabIndex={onglet === o.code ? 0 : -1}
                onClick={() => setOnglet(o.code)}
              >
                {o.libelle}
              </button>
            ))}
          </div>
          <div id="adm-panneau" role="tabpanel" aria-labelledby={`adm-${onglet}`}>
            {onglet === 'changements' && <Changements />}
            {onglet === 'sources' && <Sources role={admin.role} />}
            {onglet === 'historique' && <Historique role={admin.role} />}
          </div>
        </>
      )}
    </>
  );
}
