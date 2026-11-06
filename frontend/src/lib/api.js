// Client de l'API CampusLens. En développement, Vite relaie /api vers le backend.
const BASE = import.meta.env.VITE_API_URL ?? '';

/** Erreur lisible par un étudiant : jamais de détail technique à l'écran. */
export class ErreurApi extends Error {
  constructor(message, { status = null } = {}) {
    super(message);
    this.name = 'ErreurApi';
    this.status = status;
  }
}

const MESSAGE_INDISPONIBLE =
  'Les données sont momentanément indisponibles. Vérifiez votre connexion puis réessayez.';

/**
 * Événement émis quand le serveur dit que la session d'administration n'est plus valable (réponse 401 portant le code
 * `session_expiree`). L'administration l'écoute pour ouvrir la fenêtre de reconnexion, SANS quitter la page : ce que
 * l'administrateur était en train de saisir n'est pas perdu. Un simple mauvais mot de passe (autre 401) ne l'émet pas.
 */
export const EVENEMENT_SESSION_EXPIREE = 'campuslens:session-expiree';
export const MESSAGE_SESSION_EXPIREE =
  'Votre session a expiré. Reconnectez-vous, puis recommencez.';

/** Si la réponse d'erreur signifie « session expirée », prévient l'application et renvoie l'erreur à lever. */
function erreurDeSession(reponse, donnees, { lecture, controle = false }) {
  if (reponse.status !== 401 || donnees?.code !== 'session_expiree') return null;
  window.dispatchEvent(
    new CustomEvent(EVENEMENT_SESSION_EXPIREE, { detail: { lecture, controle } }),
  );
  return new ErreurApi(MESSAGE_SESSION_EXPIREE, { status: 401 });
}

/**
 * @param options.controle  lecture faite en arrière-plan (contrôle de la session, compteur de non lus) : si la session est
 *   terminée, on prévient l'application sans que cela compte comme « une page n'a pas pu se charger ».
 */
export async function get(chemin, { signal, controle = false } = {}) {
  let reponse;
  try {
    reponse = await fetch(`${BASE}/api${chemin}`, {
      signal,
      // « X-Controle » : le serveur ne compte pas cette requête comme une action de l'administrateur (délai d'inactivité).
      headers: { Accept: 'application/json', ...(controle ? { 'X-Controle': '1' } : {}) },
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    throw new ErreurApi(MESSAGE_INDISPONIBLE);
  }
  if (!reponse.ok) {
    const donnees = await reponse.json().catch(() => ({}));
    throw (
      erreurDeSession(reponse, donnees, { lecture: !controle, controle }) ??
      new ErreurApi(MESSAGE_INDISPONIBLE, { status: reponse.status })
    );
  }
  try {
    return await reponse.json();
  } catch {
    throw new ErreurApi(MESSAGE_INDISPONIBLE, { status: reponse.status });
  }
}

/** @param options.message429  texte affiché si le serveur répond « trop de demandes » */
export async function post(
  chemin,
  corps,
  { message429 = 'Trop de demandes. Réessayez dans quelques instants.' } = {},
) {
  let reponse;
  try {
    reponse = await fetch(`${BASE}/api${chemin}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(corps),
    });
  } catch {
    throw new ErreurApi(MESSAGE_INDISPONIBLE);
  }
  const donnees = await reponse.json().catch(() => ({}));
  if (!reponse.ok) {
    throw (
      erreurDeSession(reponse, donnees, { lecture: false }) ??
      new ErreurApi(reponse.status === 429 ? message429 : (donnees.error ?? MESSAGE_INDISPONIBLE), {
        status: reponse.status,
      })
    );
  }
  return donnees;
}

/** DELETE : renvoie {} (les suppressions répondent 204, sans contenu). */
export async function supprimer(chemin) {
  let reponse;
  try {
    reponse = await fetch(`${BASE}/api${chemin}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new ErreurApi(MESSAGE_INDISPONIBLE);
  }
  if (!reponse.ok) {
    const donnees = await reponse.json().catch(() => ({}));
    throw (
      erreurDeSession(reponse, donnees, { lecture: false }) ??
      new ErreurApi(donnees.error ?? MESSAGE_INDISPONIBLE, { status: reponse.status })
    );
  }
  return {};
}
