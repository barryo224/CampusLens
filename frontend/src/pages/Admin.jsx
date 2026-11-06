import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useOutletContext } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import MessageErreur from '../components/MessageErreur.jsx';
import ZoneDefilante from '../components/ZoneDefilante.jsx';
import { get, post, supprimer, ErreurApi, EVENEMENT_SESSION_EXPIREE } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { usePageTitre } from '../lib/usePageTitre.js';
import { formaterDateHeure, formaterDate } from '../lib/format.js';
import LienExterne from '../components/LienExterne.jsx';
import BoutonMenu from '../components/BoutonMenu.jsx';
import FondMenu from '../components/FondMenu.jsx';
import { useMenuRepliable } from '../lib/useMenuRepliable.js';
import { blocageRobot } from '../lib/blocageRobot.js';

const PHRASE_SITE_BLOQUE = 'Ce site refuse les robots du serveur : à vérifier à la main.';
/** Le serveur a marqué la source comme bloquée, ou le dernier message du robot est un refus. */
const siteBloque = (s) =>
  Boolean(s.bloqueRobot) || Boolean(blocageRobot(s.derniereSynchronisation?.messageErreur));

/**
 * Rappel : un robot bloqué ne voit pas les changements de prix. Ces sources se revérifient à la main tous les 90 jours,
 * et surtout en août-septembre, quand les réseaux de transport changent leurs tarifs.
 */
function RappelSitesBloques({ sources }) {
  const bloquees = sources.filter(siteBloque);
  if (bloquees.length === 0) return null;
  return (
    <div className="message" role="note" data-testid="rappel-sites-bloques">
      <strong>
        {bloquees.length} source{bloquees.length > 1 ? 's sont bloquées' : ' est bloquée'} par leur
        site.
      </strong>{' '}
      Le robot ne peut pas les lire : rien ne vous prévient si un prix change. Revérifiez-les à la
      main tous les 90 jours, et surtout en août et septembre, quand les réseaux changent leurs
      tarifs. Concernées : {bloquees.map((s) => s.nom).join(', ')}.
    </div>
  );
}

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

// Sécurité de l'administration : un onglet laissé ouvert sans aucune action est déconnecté après 20 minutes (comme une
// banque), et la session est contrôlée chaque minute, au retour sur l'onglet et à la réouverture de l'ordinateur.
const INACTIVITE_MAX_MS = 20 * 60 * 1000; // même délai que le serveur (INACTIVITE_MAX_MS dans routes/admin.js)
const VERIFICATION_SESSION_MS = 60 * 1000;

/**
 * Formulaire de connexion. `titre`, `message` et `emailInitial` servent à la reconnexion après une session expirée :
 * il s'affiche alors par-dessus la page (voir AdminLayout), l'adresse est déjà remplie et on tape seulement le mot de passe.
 */
function Connexion({ surConnecte, titre = 'Connexion', message: avis = null, emailInitial = '' }) {
  const [champs, setChamps] = useState({ email: emailInitial, motDePasse: '' });
  const champMotDePasse = useRef(null);
  const [etape, setEtape] = useState('mot-de-passe'); // « code » : la double authentification attend le code
  const [code, setCode] = useState('');
  // Code reçu par e-mail : adresse masquée, compte à rebours avant de pouvoir le redemander, bascule vers l'application.
  const [infoCode, setInfoCode] = useState(null);
  const [restant, setRestant] = useState(0);
  const [modeApplication, setModeApplication] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const decompteEnCours = restant > 0;
  useEffect(() => {
    if (!decompteEnCours) return undefined;
    const minuterie = setInterval(() => setRestant((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(minuterie);
  }, [decompteEnCours]);
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const champCode = useRef(null);

  useEffect(() => {
    if (etape === 'code') champCode.current?.focus();
    else if (emailInitial) champMotDePasse.current?.focus();
  }, [etape, emailInitial]);

  const message = (err) =>
    err.status === 429 ? 'Trop de tentatives. Réessayez dans quelques minutes.' : err.message;

  async function envoyer(e) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await post('/admin/login', champs);
      if (r.etape === 'code') {
        setInfoCode(r);
        setRestant(r.methode === 'courriel' ? (r.renvoyerApres ?? 30) : 0);
        setModeApplication(r.methode !== 'courriel');
        setConfirmation(null);
        setCode('');
        setEtape('code');
      } else surConnecte(r);
    } catch (err) {
      setErreur(message(err));
    } finally {
      setEnvoi(false);
    }
  }

  async function envoyerCode(e, valeur = code) {
    e?.preventDefault();
    setEnvoi(true);
    setErreur(null);
    setConfirmation(null);
    try {
      surConnecte(await post('/admin/login/code', { code: valeur }));
    } catch (err) {
      setCode('');
      // Trop d'erreurs ou délai dépassé : le serveur a fermé la tentative, il faut ressaisir le mot de passe.
      if (/recommencez/i.test(err.message)) {
        setEtape('mot-de-passe');
        setChamps((c) => ({ ...c, motDePasse: '' }));
      }
      setErreur(message(err));
    } finally {
      setEnvoi(false);
    }
  }

  // « Renvoyer le code » : possible 30 s après l'envoi précédent (le serveur le vérifie aussi).
  async function renvoyerCode() {
    setErreur(null);
    setConfirmation(null);
    try {
      const r = await post('/admin/login/renvoyer', {});
      setRestant(r.renvoyerApres ?? 30);
      setCode('');
      setConfirmation('Un nouveau code vient d’être envoyé. L’ancien ne fonctionne plus.');
      champCode.current?.focus();
    } catch (err) {
      if (/recommencez/i.test(err.message)) {
        setEtape('mot-de-passe');
        setChamps((c) => ({ ...c, motDePasse: '' }));
      }
      setErreur(message(err));
    }
  }

  // Le code arrive en 6 chiffres (souvent proposé par le clavier) : on valide dès que les 6 chiffres sont là.
  const surSaisieCode = (texte) => {
    setCode(texte);
    if (!envoi && /^\d{6}$/.test(texte.replace(/\s+/g, ''))) envoyerCode(null, texte);
  };

  if (etape === 'code') {
    const parCourriel = infoCode?.methode === 'courriel' && !modeApplication;
    return (
      <section className="carte carte-compte" aria-labelledby="titre-code">
        <h2 id="titre-code" className="titre-carte">
          {parCourriel ? 'Vérification par e-mail' : 'Double authentification'}
        </h2>
        {infoCode?.courrielEchec && (
          <p className="message message-erreur" role="alert">
            L’envoi du code par e-mail n’a pas fonctionné : utilisez votre application
            d’authentification.
          </p>
        )}
        {parCourriel ? (
          <p>
            Un code à 6 chiffres vient d’être envoyé à <strong>{infoCode.adresse}</strong>.
            Saisissez-le ci-dessous : il est valable 5 minutes.
          </p>
        ) : (
          <p>
            Ouvrez votre application d’authentification et saisissez le code à 6 chiffres. Si vous
            avez perdu votre téléphone, saisissez l’un de vos codes de secours.
          </p>
        )}
        {confirmation && (
          <p className="message message-succes" role="status">
            {confirmation}
          </p>
        )}
        {erreur && (
          <p className="message message-erreur" role="alert">
            {erreur}
          </p>
        )}
        <form onSubmit={envoyerCode}>
          <div className="champ">
            <label htmlFor="admin-code">
              {parCourriel ? 'Code reçu par e-mail' : 'Code de sécurité'}
            </label>
            <input
              id="admin-code"
              ref={champCode}
              type="text"
              inputMode={parCourriel ? 'numeric' : 'text'}
              required
              autoComplete="one-time-code"
              maxLength={20}
              value={code}
              onChange={(e) => surSaisieCode(e.target.value)}
            />
          </div>
          <button type="submit" className="bouton" disabled={envoi || code.trim() === ''}>
            {envoi ? 'Vérification…' : 'Valider'}
          </button>{' '}
          <button
            type="button"
            className="bouton bouton-secondaire"
            onClick={() => {
              setEtape('mot-de-passe');
              setCode('');
              setErreur(null);
            }}
          >
            Retour
          </button>
        </form>
        {infoCode?.methode === 'courriel' && (
          <div className="renvoi-code">
            {parCourriel && (
              <p className="fraicheur">
                Vous n’avez rien reçu ? Regardez dans vos courriers indésirables, ou redemandez un
                code.
              </p>
            )}
            {parCourriel && (
              <button
                type="button"
                className="bouton bouton-secondaire"
                onClick={renvoyerCode}
                disabled={decompteEnCours}
              >
                {decompteEnCours ? `Renvoyer le code dans ${restant} s` : 'Renvoyer le code'}
              </button>
            )}
            {infoCode.application && (
              <p>
                <button
                  type="button"
                  className="lien-action"
                  onClick={() => {
                    setModeApplication(!modeApplication);
                    setCode('');
                    setErreur(null);
                    setConfirmation(null);
                  }}
                >
                  {modeApplication
                    ? 'Recevoir un code par e-mail à la place'
                    : 'Utiliser mon application d’authentification à la place'}
                </button>
              </p>
            )}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="carte carte-compte" aria-labelledby="titre-connexion">
      <h2 id="titre-connexion" className="titre-carte">
        {titre}
      </h2>
      {avis && (
        <p className="message" role="status">
          {avis}
        </p>
      )}
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
            ref={champMotDePasse}
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
        <LienExterne href={changement.source.url}>Ouvrir la page officielle</LienExterne>
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

/** Comment une source est suivie : la même phrase partout, pour ne jamais se demander « pourquoi pas de bouton ? ». */
function typeDeSuivi(s) {
  if (!s.robot) return 'Manuelle';
  if (s.veille) return 'Veille (vous vérifiez)';
  return s.niveau === 1 ? 'Robot automatique' : 'Robot (vous validez)';
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
        `${s.nom} : ${blocageRobot(r.message) ? 'Bloquée par le site' : (LIBELLE_SYNC[r.statut] ?? r.statut)}${r.message ? ` — ${blocageRobot(r.message) ?? r.message}` : ''}`,
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
      <RappelSitesBloques sources={data} />
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
                <td>{typeDeSuivi(s)}</td>
                <td>
                  {siteBloque(s) ? (
                    s.statut === 'ok' ? (
                      <span className="badge badge-vert">À jour (vérifié à la main)</span>
                    ) : (
                      <span className="badge badge-orange">À vérifier à la main</span>
                    )
                  ) : (
                    <span className={`badge ${CLASSE_STATUT_SOURCE[s.statut]}`}>
                      {LIBELLE_STATUT_SOURCE[s.statut]}
                    </span>
                  )}
                  {!s.robot && (
                    <span className="fraicheur">
                      <br />
                      Pas de robot : à vérifier à la main
                    </span>
                  )}
                </td>
                <td>{formaterDateHeure(s.dernierControle)}</td>
                <td>{s.frequenceHeures} h</td>
                <td>
                  {s.derniereSynchronisation ? (
                    <>
                      {siteBloque(s)
                        ? 'Bloquée par le site'
                        : LIBELLE_SYNC[s.derniereSynchronisation.statut]}
                      {s.derniereSynchronisation.messageErreur && (
                        <span className="fraicheur">
                          <br />
                          {blocageRobot(s.derniereSynchronisation.messageErreur) ??
                            (siteBloque(s)
                              ? PHRASE_SITE_BLOQUE
                              : s.derniereSynchronisation.messageErreur)}
                        </span>
                      )}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td>{s.changementsEnAttente}</td>
                <td>
                  {s.robot && role === 'admin' && (
                    <button
                      type="button"
                      className="bouton bouton-secondaire"
                      onClick={() => lancer(s)}
                    >
                      Lancer<span className="sr-only"> : {s.nom}</span>
                    </button>
                  )}
                  {/* Une source sans robot (ou avec simple veille) se vérifie à la main : on dit où, au lieu d'un tiret. */}
                  {s.verificationManuelle && (
                    <Link to="/admin/verification" className="lien-action">
                      Vérifier à la main<span className="sr-only"> : {s.nom}</span>
                    </Link>
                  )}
                  {s.robot && role !== 'admin' && !s.verificationManuelle && (
                    <span className="fraicheur">Réservé à l’administrateur</span>
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

function Messages({ surChangement }) {
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

  const nonLus = data.filter((m) => !m.luLe).length;

  async function marquerLu(m) {
    try {
      await post(`/admin/messages/${m.id}/lu`, {});
      recharger();
      surChangement?.();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function toutLire() {
    setMessage(null);
    try {
      await post('/admin/messages/tout-lire', {});
      setMessage('Tous les messages sont marqués comme lus.');
      recharger();
      surChangement?.();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function effacer(m) {
    if (!window.confirm(`Supprimer définitivement le message « ${m.objet} » de ${m.email} ?`))
      return;
    setMessage(null);
    try {
      await supprimer(`/admin/messages/${m.id}`);
      setMessage('Message supprimé.');
      recharger();
      surChangement?.();
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
      {nonLus > 0 && (
        <p className="barre-admin">
          <strong>
            {nonLus} message{nonLus > 1 ? 's' : ''} non lu{nonLus > 1 ? 's' : ''}
          </strong>
          <button type="button" className="bouton bouton-secondaire" onClick={toutLire}>
            Tout marquer comme lu
          </button>
        </p>
      )}
      {data.length === 0 ? (
        <p className="message">Aucun message reçu pour l’instant.</p>
      ) : (
        <>
          <h2 className="sr-only">Messages reçus</h2>
          <ul className="grille" style={{ listStyle: 'none', padding: 0 }}>
            {data.map((m) => (
              <li key={m.id} className={`carte changement${m.luLe ? '' : ' message-non-lu'}`}>
                <h3>
                  {m.objet}
                  {!m.luLe && <span className="badge badge-orange badge-nouveau">Nouveau</span>}
                </h3>
                <p className="fraicheur">
                  De <a href={`mailto:${m.email}`}>{m.email}</a> · reçu le{' '}
                  {formaterDateHeure(m.creeLe)} · supprimé automatiquement le{' '}
                  {formaterDate(m.supprimerApres)}
                </p>
                <p className="message-texte">{m.message}</p>
                <div
                  className="resultat-actions"
                  style={{ gridTemplateColumns: 'repeat(3, auto)', justifyContent: 'start' }}
                >
                  <a
                    className="bouton"
                    href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.objet}`)}`}
                  >
                    Répondre<span className="sr-only"> à {m.email}</span>
                  </a>
                  {!m.luLe && (
                    <button
                      type="button"
                      className="bouton bouton-secondaire"
                      onClick={() => marquerLu(m)}
                    >
                      Marquer comme lu<span className="sr-only"> : {m.objet}</span>
                    </button>
                  )}
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

const LIBELLES_PAGE_AVIS = {
  accueil: 'Accueil',
  evaluer: 'Évaluer ma situation',
  aides: 'Mes aides',
  budget: 'Préparer mon budget',
  ressources: 'Ressources',
  a_propos: 'À propos',
  autre: 'Autre page',
};
const LIBELLES_PROFIL_AVIS = {
  fr_ue: 'Étudiant français ou UE',
  boursier: 'Étudiant boursier',
  intl: 'Étudiant international hors UE',
};

/** Avis des visiteurs sur le site : anonymes (aucun nom, e-mail ni adresse IP), supprimés automatiquement. */
function AvisVisiteurs({ surChangement }) {
  const { data, erreur, recharger } = useApi('/admin/avis', { garderAnciennes: true });
  const [message, setMessage] = useState(null);
  if (erreur) return <MessageErreur erreur={erreur} surReessayer={recharger} />;
  if (!data)
    return (
      <p className="message" role="status">
        Chargement…
      </p>
    );
  const { stats, avis } = data;
  const maxRepartition = Math.max(...Object.values(stats.repartition), 1);

  async function agir(action, succes) {
    setMessage(null);
    try {
      await action();
      if (succes) setMessage(succes);
      recharger();
      surChangement?.();
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <>
      <p className="fraicheur" style={{ marginBottom: 12 }}>
        Avis anonymes : aucun nom, e-mail ni adresse IP n’est enregistré. Chaque avis est supprimé
        automatiquement à la date indiquée (12 mois après l’envoi). C’est un ressenti, pas une
        mesure : n’importe qui peut en envoyer, avec une limite par visiteur.
      </p>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}

      <section className="carte" aria-labelledby="titre-stats-avis" style={{ marginBottom: 16 }}>
        <h2 id="titre-stats-avis" className="titre-carte">
          Vue d’ensemble
        </h2>
        {stats.total === 0 ? (
          <p>Aucun avis reçu pour l’instant.</p>
        ) : (
          <div className="stats-avis">
            <p data-testid="moyenne-avis">
              <strong className="indicateur-valeur">
                {String(stats.moyenne).replace('.', ',')} / 5
              </strong>
              <br />
              <span className="fraicheur">
                moyenne sur {stats.total} avis
                {stats.nonLus > 0
                  ? `, dont ${stats.nonLus} non lu${stats.nonLus > 1 ? 's' : ''}`
                  : ''}
              </span>
            </p>
            <ul className="repartition" aria-label="Répartition des notes">
              {[5, 4, 3, 2, 1].map((n) => (
                <li key={n}>
                  <span>
                    {n} ★<span className="sr-only"> : {stats.repartition[n]} avis</span>
                  </span>
                  <span className="barre" aria-hidden="true">
                    <span style={{ width: `${(stats.repartition[n] / maxRepartition) * 100}%` }} />
                  </span>
                  <strong aria-hidden="true">{stats.repartition[n]}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {stats.nonLus > 0 && (
        <p className="barre-admin">
          <strong>
            {stats.nonLus} avis non lu{stats.nonLus > 1 ? 's' : ''}
          </strong>
          <button
            type="button"
            className="bouton bouton-secondaire"
            onClick={() =>
              agir(() => post('/admin/avis/tout-lire', {}), 'Tous les avis sont marqués comme lus.')
            }
          >
            Tout marquer comme lu
          </button>
        </p>
      )}

      {avis.length > 0 && (
        <>
          <h2 className="sr-only">Avis reçus</h2>
          <ul className="grille" style={{ listStyle: 'none', padding: 0 }}>
            {avis.map((a) => (
              <li key={a.id} className={`carte changement${a.luLe ? '' : ' message-non-lu'}`}>
                <h3>
                  <span aria-hidden="true">{'★'.repeat(a.note)}</span>
                  <span className="sr-only">Note : {a.note} sur 5</span>
                  <span className="fraicheur" aria-hidden="true">
                    {' '}
                    {a.note} / 5
                  </span>
                  {!a.luLe && <span className="badge badge-orange badge-nouveau">Nouveau</span>}
                </h3>
                <p className="fraicheur">
                  {LIBELLES_PAGE_AVIS[a.page] ?? 'Page non précisée'}
                  {a.profil ? ` · ${LIBELLES_PROFIL_AVIS[a.profil] ?? a.profil}` : ''} · reçu le{' '}
                  {formaterDateHeure(a.creeLe)} · supprimé automatiquement le{' '}
                  {formaterDate(a.supprimerApres)}
                </p>
                <p className="message-texte">
                  {a.commentaire ?? <em>Aucun commentaire, note seule.</em>}
                </p>
                <div
                  className="resultat-actions"
                  style={{ gridTemplateColumns: 'repeat(2, auto)', justifyContent: 'start' }}
                >
                  {!a.luLe && (
                    <button
                      type="button"
                      className="bouton bouton-secondaire"
                      onClick={() => agir(() => post(`/admin/avis/${a.id}/lu`, {}))}
                    >
                      Marquer comme lu<span className="sr-only"> : avis {a.note} sur 5</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="bouton bouton-secondaire"
                    onClick={() => {
                      if (!window.confirm('Supprimer définitivement cet avis ?')) return;
                      agir(() => supprimer(`/admin/avis/${a.id}`), 'Avis supprimé.');
                    }}
                  >
                    Supprimer<span className="sr-only"> : avis {a.note} sur 5</span>
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

/** Double authentification : activer (clé + code de vérification + codes de secours), désactiver (mot de passe + code). */
function DoubleAuthentification() {
  const { rafraichirAdmin } = useOutletContext();
  const { data, erreur, recharger } = useApi('/admin/2fa', { garderAnciennes: true });
  const [preparation, setPreparation] = useState(null); // { secret, adresse } pendant l'activation
  const [code, setCode] = useState('');
  const [secours, setSecours] = useState(null); // codes de secours, affichés UNE fois
  const [retrait, setRetrait] = useState(null); // { motDePasse, code } pendant la désactivation
  const [etat, setEtat] = useState({ envoi: false, erreur: null, message: null });

  if (erreur) return <MessageErreur erreur={erreur} surReessayer={recharger} />;
  if (!data)
    return (
      <p className="message" role="status">
        Chargement…
      </p>
    );

  const echec = (err) => setEtat({ envoi: false, erreur: err.message, message: null });

  async function commencer() {
    setEtat({ envoi: true, erreur: null, message: null });
    try {
      setPreparation(await post('/admin/2fa/preparer', {}));
      setEtat({ envoi: false, erreur: null, message: null });
    } catch (err) {
      echec(err);
    }
  }

  async function activer(e) {
    e.preventDefault();
    setEtat({ envoi: true, erreur: null, message: null });
    try {
      const r = await post('/admin/2fa/activer', { code });
      setSecours(r.codesSecours);
      setPreparation(null);
      setCode('');
      setEtat({ envoi: false, erreur: null, message: null });
      recharger();
      rafraichirAdmin?.();
    } catch (err) {
      echec(err);
    }
  }

  async function desactiver(e) {
    e.preventDefault();
    setEtat({ envoi: true, erreur: null, message: null });
    try {
      await post('/admin/2fa/desactiver', retrait);
      setRetrait(null);
      setEtat({ envoi: false, erreur: null, message: 'Double authentification désactivée.' });
      recharger();
      rafraichirAdmin?.();
    } catch (err) {
      echec(err);
    }
  }

  return (
    <section className="carte carte-compte" aria-labelledby="titre-2fa">
      <h2 id="titre-2fa" className="titre-carte">
        Double authentification
      </h2>
      {etat.message && (
        <p className="message message-succes" role="status">
          {etat.message}
        </p>
      )}
      {etat.erreur && (
        <p className="message message-erreur" role="alert">
          {etat.erreur}
        </p>
      )}

      {secours && (
        <div role="region" aria-label="Codes de secours" className="codes-secours">
          <p>
            <strong>La double authentification est activée.</strong> Voici vos codes de secours.
            Chacun ne sert qu’une fois, si vous perdez votre téléphone.{' '}
            <strong>
              Notez-les maintenant dans un endroit sûr : ils ne seront plus jamais affichés.
            </strong>
          </p>
          <ul className="liste-codes">
            {secours.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
          <button type="button" className="bouton" onClick={() => setSecours(null)}>
            J’ai noté mes codes
          </button>
        </div>
      )}

      {!secours && !data.actif && !preparation && (
        <>
          <p>
            <strong>Non activée.</strong> Avec la double authentification, le mot de passe ne suffit
            plus : il faut aussi un code à 6 chiffres qui change toutes les 30 secondes, produit par
            une application sur votre téléphone (Google Authenticator, Microsoft Authenticator,
            Aegis…). Même si votre mot de passe était volé, personne ne pourrait entrer.
          </p>
          <button type="button" className="bouton" onClick={commencer} disabled={etat.envoi}>
            Activer la double authentification
          </button>
        </>
      )}

      {preparation && (
        <form onSubmit={activer}>
          <ol className="etapes-2fa">
            <li>
              Dans votre application d’authentification, ajoutez un compte et choisissez « saisir
              une clé ». Recopiez cette clé :
              <p>
                <code className="cle-2fa" data-testid="cle-2fa">
                  {preparation.secret}
                </code>
              </p>
              <p className="fraicheur">
                Sur le téléphone qui affiche cette page, vous pouvez aussi{' '}
                <a href={preparation.adresse}>ouvrir directement l’application</a>.
              </p>
            </li>
            <li>Saisissez ci-dessous le code à 6 chiffres que l’application affiche.</li>
          </ol>
          <div className="champ">
            <label htmlFor="code-activation">Code à 6 chiffres</label>
            <input
              id="code-activation"
              type="text"
              inputMode="numeric"
              required
              autoComplete="one-time-code"
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <button type="submit" className="bouton" disabled={etat.envoi || code.trim() === ''}>
            Vérifier et activer
          </button>{' '}
          <button
            type="button"
            className="bouton bouton-secondaire"
            onClick={() => {
              setPreparation(null);
              setCode('');
              setEtat({ envoi: false, erreur: null, message: null });
            }}
          >
            Annuler
          </button>
        </form>
      )}

      {!secours && data.actif && !retrait && (
        <>
          <p>
            <strong>Activée.</strong> Il vous reste {data.codesSecoursRestants} code
            {data.codesSecoursRestants > 1 ? 's' : ''} de secours.
          </p>
          <button
            type="button"
            className="bouton bouton-secondaire"
            onClick={() => setRetrait({ motDePasse: '', code: '' })}
          >
            Désactiver…
          </button>
        </>
      )}

      {data.actif && retrait && (
        <form onSubmit={desactiver}>
          <p>Pour retirer cette protection, confirmez avec votre mot de passe et un code.</p>
          <div className="champ">
            <label htmlFor="retrait-mdp">Mot de passe</label>
            <input
              id="retrait-mdp"
              type="password"
              required
              autoComplete="current-password"
              value={retrait.motDePasse}
              onChange={(e) => setRetrait({ ...retrait, motDePasse: e.target.value })}
            />
          </div>
          <div className="champ">
            <label htmlFor="retrait-code">Code à 6 chiffres ou code de secours</label>
            <input
              id="retrait-code"
              type="text"
              required
              autoComplete="one-time-code"
              maxLength={20}
              value={retrait.code}
              onChange={(e) => setRetrait({ ...retrait, code: e.target.value })}
            />
          </div>
          <button type="submit" className="bouton" disabled={etat.envoi}>
            Désactiver la double authentification
          </button>{' '}
          <button
            type="button"
            className="bouton bouton-secondaire"
            onClick={() => setRetrait(null)}
          >
            Annuler
          </button>
        </form>
      )}
    </section>
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
    <>
      <DoubleAuthentification />
      <section className="carte carte-compte" aria-labelledby="titre-compte">
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
            <input
              type="checkbox"
              checked={visible}
              onChange={(e) => setVisible(e.target.checked)}
            />
            Afficher les mots de passe
          </label>
          <button type="submit" className="bouton" disabled={!pret}>
            {etat.envoi ? 'Modification…' : 'Changer mon mot de passe'}
          </button>
        </form>
      </section>
    </>
  );
}

const TYPES_LIBELLE = {
  parametre: 'Valeur de calcul',
  aide: 'Aide',
  poste: 'Poste de rentrée',
  transport: 'Abonnement de transport',
  association: 'Association',
};

function Verification() {
  const { data, erreur, recharger } = useApi('/admin/verification', { garderAnciennes: true });
  const [message, setMessage] = useState(null);
  if (erreur) return <MessageErreur erreur={erreur} surReessayer={recharger} />;
  if (!data)
    return (
      <p className="message" role="status">
        Chargement…
      </p>
    );

  // On regroupe par source : on vérifie une source officielle, puis toutes ses données.
  const groupes = new Map();
  for (const item of data) {
    if (!groupes.has(item.source.id))
      groupes.set(item.source.id, { source: item.source, items: [] });
    groupes.get(item.source.id).items.push(item);
  }

  async function verifier(item) {
    if (!window.confirm(`Avez-vous comparé « ${item.libelle} » à sa source officielle ?`)) return;
    setMessage(null);
    try {
      await post(`/admin/verification/${item.type}/${item.id}`, {});
      setMessage(`« ${item.libelle} » est marqué comme vérifié.`);
      recharger();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function toutVerifier(source, nombre) {
    if (
      !window.confirm(
        `Avez-vous vérifié les ${nombre} données de « ${source.nom} » sur la source officielle ?`,
      )
    )
      return;
    setMessage(null);
    try {
      const r = await post(`/admin/verification/source/${source.id}`, {});
      setMessage(
        `${r.verifiees} donnée${r.verifiees > 1 ? 's' : ''} de « ${source.nom} » marquée${r.verifiees > 1 ? 's' : ''} comme vérifiée${r.verifiees > 1 ? 's' : ''}.`,
      );
      recharger();
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <>
      <p className="fraicheur" style={{ marginBottom: 12 }}>
        Tant qu’une donnée n’est pas vérifiée, le site affiche « vérification en cours » à côté
        d’elle. Ouvrez la source officielle, comparez, puis cliquez sur « J’ai vérifié ». La mention
        revient toute seule après le délai propre à chaque source : il faut alors revérifier.
      </p>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
      {data.length === 0 ? (
        <p className="message message-succes">
          Toutes les données sont vérifiées. Rien à faire pour l’instant.
        </p>
      ) : (
        <>
          <h2 className="sr-only">Données à vérifier, par source</h2>
          <p className="barre-admin">
            <strong>
              {data.length} donnée{data.length > 1 ? 's' : ''} à vérifier
            </strong>{' '}
            <span data-testid="resume-verification">
              dans {groupes.size} source{groupes.size > 1 ? 's' : ''} :{' '}
              {Object.entries(data.reduce((n, i) => ({ ...n, [i.type]: (n[i.type] ?? 0) + 1 }), {}))
                .map(([type, n]) => `${TYPES_LIBELLE[type] ?? type} ${n}`)
                .join(' · ')}
            </span>
          </p>
          <ul className="grille" style={{ listStyle: 'none', padding: 0 }}>
            {[...groupes.values()].map(({ source, items }) => (
              <li key={source.id} className="carte changement">
                <h3>{source.nom}</h3>
                <p className="fraicheur">
                  {source.organisme} ·{' '}
                  <LienExterne href={source.url}>Ouvrir la source officielle</LienExterne> ·{' '}
                  {source.bloqueRobot
                    ? 'ce site refuse les robots : rien ne vous prévient s’il change, votre vérification vaut 90 jours'
                    : source.veille
                      ? 'page surveillée chaque jour : votre vérification reste valable tant qu’elle ne change pas'
                      : `à revérifier tous les ${Math.max(1, Math.round(source.frequenceHeures / 24))} jours`}
                </p>
                <ul className="liste-verification">
                  {items.map((item) => (
                    <li key={`${item.type}-${item.id}`}>
                      <div>
                        <strong>{item.libelle}</strong>{' '}
                        <span className="badge badge-gris">{TYPES_LIBELLE[item.type]}</span>
                        <p className="fraicheur">{item.detail}</p>
                      </div>
                      <button
                        type="button"
                        className="bouton bouton-secondaire"
                        onClick={() => verifier(item)}
                      >
                        J’ai vérifié<span className="sr-only"> : {item.libelle}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {items.length > 1 && (
                  <div>
                    <button
                      type="button"
                      className="bouton"
                      onClick={() => toutVerifier(source, items.length)}
                    >
                      J’ai tout vérifié pour cette source
                      <span className="sr-only"> : {source.nom}</span>
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

// Sections de l'administration : chacune a sa propre adresse (/admin/sources…), donc elle est conservée
// quand on recharge la page ou qu'on revient en arrière.
const SECTIONS = [
  { chemin: 'changements', libelle: 'À valider' },
  { chemin: 'sources', libelle: 'État des sources' },
  { chemin: 'verification', libelle: 'Données à vérifier' },
  { chemin: 'historique', libelle: 'Historique' },
  { chemin: 'messages', libelle: 'Messages', roleRequis: 'admin' }, // données personnelles : admin seulement
  { chemin: 'avis', libelle: 'Avis', roleRequis: 'admin' },
  { chemin: 'compte', libelle: 'Mon compte' },
];

/** Pages des sections (affichées dans la mise en page d'administration). */
export const PageChangements = () => <Changements />;
export const PageSources = () => <Sources role={useOutletContext().admin.role} />;
export const PageHistorique = () => <Historique role={useOutletContext().admin.role} />;
export function PageMessages() {
  const { admin, rafraichirNonLus } = useOutletContext();
  // Un « relecteur » qui tape l'adresse à la main est ramené à une page qu'il peut voir.
  if (admin.role !== 'admin') return <Navigate to="/admin/changements" replace />;
  return <Messages surChangement={rafraichirNonLus} />;
}
export function PageAvis() {
  const { admin, rafraichirNonLus } = useOutletContext();
  if (admin.role !== 'admin') return <Navigate to="/admin/changements" replace />;
  return <AvisVisiteurs surChangement={rafraichirNonLus} />;
}
export const PageVerification = () => <Verification />;
export const PageCompte = () => <MonCompte />;
export const AccueilAdmin = () => <Navigate to="/admin/changements" replace />;

/**
 * Mise en page de l'espace administration : ELLE REMPLACE celle du site public (pas de menu public ici).
 * Un lien « Voir le site » permet d'en sortir volontairement ; la session reste ouverte.
 */
export default function AdminLayout() {
  const [admin, setAdmin] = useState(undefined); // undefined = on vérifie ; null = non connecté
  const [erreur, setErreur] = useState(null);
  // La session s'est terminée alors qu'une page était ouverte : { lecture } (une lecture a échoué). La page reste affichée
  // sous la fenêtre de reconnexion, donc rien de ce qui était saisi n'est perdu.
  const [expiree, setExpiree] = useState(null);
  const [motif, setMotif] = useState(null); // 'inactivite' : message affiché après une déconnexion automatique
  const [cleContenu, setCleContenu] = useState(0); // change après une reconnexion pour recharger une page qui n'a pas pu se charger
  const [nonLus, setNonLus] = useState(0);
  const [avisNonLus, setAvisNonLus] = useState(0);
  const { pathname } = useLocation();
  const { ouvert: menuOuvert, basculer: basculerMenu, fermer: fermerMenu } = useMenuRepliable();
  // « (2) Espace administration » : on voit qu'un message attend, même depuis un autre onglet du navigateur.
  usePageTitre(
    nonLus + avisNonLus > 0
      ? `(${nonLus + avisNonLus}) Espace administration`
      : 'Espace administration',
  );

  // Pastille d'une section : messages ou avis jamais ouverts.
  const compteur = (chemin) =>
    chemin === 'messages' ? nonLus : chemin === 'avis' ? avisNonLus : 0;

  const rafraichirNonLus = useCallback(() => {
    get('/admin/messages/non-lus', { controle: true })
      .then((r) => {
        setNonLus(Number(r?.nombre) || 0);
        setAvisNonLus(Number(r?.avis) || 0);
      })
      .catch(() => {}); // une erreur passagère ne doit pas gêner : on garde le dernier nombre connu
  }, []);

  // Seul le rôle « admin » voit les messages. Mise à jour à l'ouverture, à chaque changement de page,
  // puis toutes les minutes tant que l'onglet reste ouvert.
  useEffect(() => {
    if (admin?.role !== 'admin') return undefined;
    rafraichirNonLus();
    const minuterie = setInterval(rafraichirNonLus, 60_000);
    return () => clearInterval(minuterie);
  }, [admin, pathname, rafraichirNonLus]);

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

  const connecte = Boolean(admin);

  // Le serveur dit que la session est terminée (n'importe quelle requête de la page) : fenêtre de reconnexion.
  useEffect(() => {
    if (!connecte) return undefined;
    const surExpiration = (e) =>
      setExpiree((avant) => ({ lecture: Boolean(avant?.lecture) || Boolean(e.detail?.lecture) }));
    window.addEventListener(EVENEMENT_SESSION_EXPIREE, surExpiration);
    return () => window.removeEventListener(EVENEMENT_SESSION_EXPIREE, surExpiration);
  }, [connecte]);

  // Tant que la session est ouverte : contrôle chaque minute et au retour sur l'onglet, et déconnexion après 20 minutes
  // sans aucun geste (clic, touche, toucher, défilement). Un contrôle qui trouve la session terminée ouvre la fenêtre de reconnexion.
  useEffect(() => {
    if (!connecte || expiree) return undefined;
    let dernierGeste = Date.now();
    const noter = () => {
      dernierGeste = Date.now();
    };
    const gestes = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel', 'scroll'];
    gestes.forEach((g) => window.addEventListener(g, noter, { passive: true, capture: true }));
    const verifier = async () => {
      if (Date.now() - dernierGeste > INACTIVITE_MAX_MS) {
        try {
          await post('/admin/logout', {});
        } catch {
          // La session est peut-être déjà terminée : on quitte l'écran quand même.
        }
        setExpiree(null);
        setMotif('inactivite');
        setAdmin(null);
        return;
      }
      get('/admin/me', { controle: true }).catch(() => {});
    };
    const minuterie = setInterval(verifier, VERIFICATION_SESSION_MS);
    const auRetour = () => {
      if (document.visibilityState === 'visible') verifier();
    };
    document.addEventListener('visibilitychange', auRetour);
    window.addEventListener('focus', auRetour);
    return () => {
      clearInterval(minuterie);
      gestes.forEach((g) => window.removeEventListener(g, noter, { capture: true }));
      document.removeEventListener('visibilitychange', auRetour);
      window.removeEventListener('focus', auRetour);
    };
  }, [connecte, expiree]);

  // Connexion réussie (première fois ou après une session expirée).
  function surConnexion(compte) {
    setAdmin(compte);
    if (expiree?.lecture) setCleContenu((n) => n + 1); // une page n'a pas pu se charger : on la recharge
    setExpiree(null);
    setMotif(null);
  }

  // Relit le compte (par exemple après avoir activé la double authentification).
  const rafraichirAdmin = useCallback(() => {
    get('/admin/me')
      .then(setAdmin)
      .catch(() => {});
  }, []);

  async function deconnecter() {
    try {
      await post('/admin/logout', {});
    } catch {
      // Même si le serveur ne répond pas, on quitte l'écran d'administration côté navigateur.
    }
    setExpiree(null);
    setMotif(null);
    setAdmin(null);
  }

  return (
    <div className="admin-app">
      <a className="lien-evitement" href="#contenu-admin">
        Aller au contenu
      </a>
      <header
        className={`admin-barre${menuOuvert ? ' menu-ouvert' : ''}`}
        inert={admin && expiree ? true : undefined}
      >
        <Link to="/admin" className="admin-marque">
          <Logo taille={34} />
          <span>
            CampusLens <small>Administration</small>
          </span>
        </Link>
        <BoutonMenu
          ouvert={menuOuvert}
          surClic={basculerMenu}
          controle="admin-menu"
          signal={nonLus + avisNonLus > 0}
        />
        <FondMenu surClic={fermerMenu} />
        <div className="admin-menu" id="admin-menu">
          {admin && (
            <nav aria-label="Sections de l’administration" className="admin-nav">
              {SECTIONS.filter((o) => !o.roleRequis || o.roleRequis === admin.role).map((o) => (
                <NavLink key={o.chemin} to={`/admin/${o.chemin}`}>
                  {o.libelle}
                  {compteur(o.chemin) > 0 && ' '}
                  {compteur(o.chemin) > 0 && (
                    <>
                      {/* Pastille visuelle (décorative) + phrase complète pour les lecteurs d'écran. */}
                      <span className="pastille-compteur" aria-hidden="true">
                        {compteur(o.chemin) > 99 ? '99+' : compteur(o.chemin)}
                      </span>
                      <span className="sr-only">
                        {' '}
                        {compteur(o.chemin) > 99 ? '99+' : compteur(o.chemin)} non lu
                        {compteur(o.chemin) > 1 ? 's' : ''}
                      </span>
                    </>
                  )}
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
            {/* Nouvel onglet : on garde la vue de l'administration ouverte à côté du site. */}
            <LienExterne href="/" className="bouton bouton-clair">
              Voir le site
            </LienExterne>
            {admin && (
              <button type="button" className="bouton bouton-clair" onClick={deconnecter}>
                Se déconnecter
              </button>
            )}
          </div>
        </div>
      </header>

      <main
        id="contenu-admin"
        className="admin-contenu"
        tabIndex={-1}
        inert={admin && expiree ? true : undefined}
      >
        {/* Connexion et « Mon compte » sont des cartes étroites centrées : leur titre l'est aussi. Les autres pages (tableaux larges) gardent l'alignement à gauche. */}
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
        {admin === null && (
          <Connexion
            surConnecte={surConnexion}
            message={
              motif === 'inactivite'
                ? 'Vous avez été déconnecté après 20 minutes d’inactivité, par sécurité. Reconnectez-vous pour continuer.'
                : null
            }
          />
        )}
        {/* Rappel tant que la double authentification n'est pas activée (sauf sur la page qui la propose). */}
        {admin && admin.deuxFacteurs === false && pathname !== '/admin/compte' && (
          <p className="message rappel-2fa" role="note">
            <strong>Protégez votre compte.</strong> Les messages des visiteurs contiennent des
            adresses e-mail : activez la double authentification dans{' '}
            <Link to="/admin/compte">Mon compte</Link>.
          </p>
        )}
        {admin && (
          <Outlet key={cleContenu} context={{ admin, rafraichirNonLus, rafraichirAdmin }} />
        )}
      </main>
      {/* Session terminée : la page reste affichée dessous (rien n'est perdu) ; on se reconnecte ici, puis on reprend. */}
      {admin && expiree && (
        <div className="session-fond">
          <div className="session-fenetre" role="dialog" aria-modal="true" aria-label="Reconnexion">
            <Connexion
              surConnecte={surConnexion}
              titre="Session expirée"
              message="Votre session a expiré. Reconnectez-vous pour continuer : ce que vous étiez en train de saisir est conservé."
              emailInitial={admin.email}
            />
          </div>
        </div>
      )}
    </div>
  );
}
