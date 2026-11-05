import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useOutletContext } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import MessageErreur from '../components/MessageErreur.jsx';
import ZoneDefilante from '../components/ZoneDefilante.jsx';
import { get, post, supprimer, ErreurApi } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { usePageTitre } from '../lib/usePageTitre.js';
import { formaterDateHeure, formaterDate } from '../lib/format.js';

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
  // Pendant un rechargement (après une action), la liste précédente reste affichée : la confirmation apparaît tout de suite.
  const { data, erreur, recharger } = useApi('/admin/sources', { garderAnciennes: true });
  const [message, setMessage] = useState(null);
  if (erreur) return <MessageErreur erreur={erreur} surReessayer={recharger} />;
  if (!data)
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
      <ZoneDefilante libelle="Tableau des sources">
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
      </ZoneDefilante>
    </>
  );
}

function Historique({ role }) {
  // Pendant un rechargement (après une action), la liste précédente reste affichée : la confirmation apparaît tout de suite.
  const { data, erreur, recharger } = useApi('/admin/historique', { garderAnciennes: true });
  const [message, setMessage] = useState(null);
  if (erreur) return <MessageErreur erreur={erreur} surReessayer={recharger} />;
  if (!data)
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
      <ZoneDefilante libelle="Tableau de l’historique">
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
      </ZoneDefilante>
    </>
  );
}

function Messages() {
  // Pendant un rechargement (après une action), la liste précédente reste affichée : la confirmation apparaît tout de suite.
  const { data, erreur, recharger } = useApi('/admin/messages', { garderAnciennes: true });
  const [message, setMessage] = useState(null);
  if (erreur) return <MessageErreur erreur={erreur} surReessayer={recharger} />;
  if (!data)
    return (
      <p className="message" role="status">
        Chargement…
      </p>
    );

  async function effacer(m) {
    if (!window.confirm(`Supprimer définitivement le message « ${m.objet} » de ${m.email} ?`))
      return;
    setMessage(null);
    try {
      await supprimer(`/admin/messages/${m.id}`);
      setMessage('Message supprimé.');
      recharger();
    } catch (err) {
      setMessage(err.message);
    }
  }
  return (
    <>
      <p className="fraicheur" style={{ marginBottom: 12 }}>
        Données personnelles : ne les gardez pas plus longtemps que nécessaire. Chaque message est
        supprimé automatiquement à la date indiquée (6 mois après l’envoi).
      </p>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
      {data.length === 0 ? (
        <p className="message">Aucun message reçu pour l’instant.</p>
      ) : (
        <>
          <h2 className="sr-only">Messages reçus</h2>
          <ul className="grille" style={{ listStyle: 'none', padding: 0 }}>
            {data.map((m) => (
              <li key={m.id} className="carte changement">
                <h3>{m.objet}</h3>
                <p className="fraicheur">
                  De <a href={`mailto:${m.email}`}>{m.email}</a> · reçu le{' '}
                  {formaterDateHeure(m.creeLe)} · supprimé automatiquement le{' '}
                  {formaterDate(m.supprimerApres)}
                </p>
                <p className="message-texte">{m.message}</p>
                <div
                  className="resultat-actions"
                  style={{ gridTemplateColumns: 'auto auto', justifyContent: 'start' }}
                >
                  <a
                    className="bouton"
                    href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.objet}`)}`}
                  >
                    Répondre<span className="sr-only"> à {m.email}</span>
                  </a>
                  <button
                    type="button"
                    className="bouton bouton-secondaire"
                    onClick={() => effacer(m)}
                  >
                    Supprimer<span className="sr-only"> : {m.objet}</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function MonCompte() {
  const { admin } = useOutletContext();
  const [champs, setChamps] = useState({ ancien: '', nouveau: '', confirmation: '' });
  const [visible, setVisible] = useState(false);
  const [etat, setEtat] = useState({ envoi: false, succes: false, erreur: null });

  const trop = champs.nouveau.length > 0 && champs.nouveau.length < 12;
  const different = champs.confirmation.length > 0 && champs.nouveau !== champs.confirmation;
  const pret =
    champs.ancien &&
    champs.nouveau.length >= 12 &&
    champs.nouveau === champs.confirmation &&
    !etat.envoi;
  const maj = (cle) => (e) => setChamps((c) => ({ ...c, [cle]: e.target.value }));
  const type = visible ? 'text' : 'password';

  async function envoyer(e) {
    e.preventDefault();
    setEtat({ envoi: true, succes: false, erreur: null });
    try {
      await post(
        '/admin/mot-de-passe',
        { ancien: champs.ancien, nouveau: champs.nouveau },
        { message429: 'Trop de tentatives. Réessayez dans quelques minutes.' },
      );
      setChamps({ ancien: '', nouveau: '', confirmation: '' });
      setEtat({ envoi: false, succes: true, erreur: null });
    } catch (err) {
      setEtat({ envoi: false, succes: false, erreur: err.message });
    }
  }

  return (
    <section className="carte" style={{ maxWidth: 560 }} aria-labelledby="titre-compte">
      <h2 id="titre-compte" className="titre-carte">
        Changer mon mot de passe
      </h2>
      <p className="fraicheur" style={{ marginBottom: 14 }}>
        Compte : <strong>{admin.email}</strong> ({admin.role})
      </p>
      {etat.succes && (
        <p className="message message-succes" role="status">
          Mot de passe modifié. Vos autres appareils connectés ont été déconnectés par sécurité.
        </p>
      )}
      {etat.erreur && (
        <p className="message message-erreur" role="alert">
          {etat.erreur}
        </p>
      )}
      <form onSubmit={envoyer}>
        <div className="champ">
          <label htmlFor="mdp-ancien">Mot de passe actuel</label>
          <input
            id="mdp-ancien"
            type={type}
            required
            autoComplete="current-password"
            value={champs.ancien}
            onChange={maj('ancien')}
          />
        </div>
        <div className="champ">
          <label htmlFor="mdp-nouveau">Nouveau mot de passe</label>
          <input
            id="mdp-nouveau"
            type={type}
            required
            autoComplete="new-password"
            aria-describedby="mdp-regles"
            aria-invalid={trop}
            value={champs.nouveau}
            onChange={maj('nouveau')}
          />
        </div>
        <ul id="mdp-regles" className="regles-mdp">
          <li className={champs.nouveau.length >= 12 ? 'regle-ok' : ''}>
            12 caractères minimum (une phrase de plusieurs mots convient très bien)
          </li>
          <li>Différent de l’ancien, et sans votre adresse e-mail</li>
        </ul>
        <div className="champ">
          <label htmlFor="mdp-confirmation">Confirmer le nouveau mot de passe</label>
          <input
            id="mdp-confirmation"
            type={type}
            required
            autoComplete="new-password"
            aria-invalid={different}
            aria-describedby={different ? 'mdp-difference' : undefined}
            value={champs.confirmation}
            onChange={maj('confirmation')}
          />
          {different && (
            <p id="mdp-difference" className="erreur-champ">
              Les deux mots de passe ne sont pas identiques.
            </p>
          )}
        </div>
        <label className="case">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
          Afficher les mots de passe
        </label>
        <button type="submit" className="bouton" disabled={!pret}>
          {etat.envoi ? 'Modification…' : 'Changer mon mot de passe'}
        </button>
      </form>
    </section>
  );
}

// Sections de l'administration : chacune a sa propre adresse (/admin/sources…), donc elle est conservée
// quand on recharge la page ou qu'on revient en arrière.
const SECTIONS = [
  { chemin: 'changements', libelle: 'À valider' },
  { chemin: 'sources', libelle: 'État des sources' },
  { chemin: 'historique', libelle: 'Historique' },
  { chemin: 'messages', libelle: 'Messages', roleRequis: 'admin' }, // données personnelles : admin seulement
  { chemin: 'compte', libelle: 'Mon compte' },
];

/** Pages des sections (affichées dans la mise en page d'administration). */
export const PageChangements = () => <Changements />;
export const PageSources = () => <Sources role={useOutletContext().admin.role} />;
export const PageHistorique = () => <Historique role={useOutletContext().admin.role} />;
export function PageMessages() {
  const { admin } = useOutletContext();
  // Un « relecteur » qui tape l'adresse à la main est ramené à une page qu'il peut voir.
  if (admin.role !== 'admin') return <Navigate to="/admin/changements" replace />;
  return <Messages />;
}
export const PageCompte = () => <MonCompte />;
export const AccueilAdmin = () => <Navigate to="/admin/changements" replace />;

/**
 * Mise en page de l'espace administration : ELLE REMPLACE celle du site public (pas de menu public ici).
 * Un lien « Voir le site » permet d'en sortir volontairement ; la session reste ouverte.
 */
export default function AdminLayout() {
  usePageTitre('Espace administration');
  const [admin, setAdmin] = useState(undefined); // undefined = on vérifie ; null = non connecté
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
    } catch {
      // Même si le serveur ne répond pas, on quitte l'écran d'administration côté navigateur.
    }
    setAdmin(null);
  }

  return (
    <div className="admin-app">
      <a className="lien-evitement" href="#contenu-admin">
        Aller au contenu
      </a>
      <header className="admin-barre">
        <Link to="/admin" className="admin-marque">
          <Logo taille={34} />
          <span>
            CampusLens <small>Administration</small>
          </span>
        </Link>
        {admin && (
          <nav aria-label="Sections de l’administration" className="admin-nav">
            {SECTIONS.filter((o) => !o.roleRequis || o.roleRequis === admin.role).map((o) => (
              <NavLink key={o.chemin} to={`/admin/${o.chemin}`}>
                {o.libelle}
              </NavLink>
            ))}
          </nav>
        )}
        <div className="admin-droite">
          {admin && (
            <span className="admin-qui">
              {admin.email} ({admin.role})
            </span>
          )}
          <Link to="/" className="bouton bouton-clair">
            Voir le site
          </Link>
          {admin && (
            <button type="button" className="bouton bouton-clair" onClick={deconnecter}>
              Se déconnecter
            </button>
          )}
        </div>
      </header>

      <main id="contenu-admin" className="admin-contenu" tabIndex={-1}>
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
        {admin && <Outlet context={{ admin }} />}
      </main>
    </div>
  );
}
