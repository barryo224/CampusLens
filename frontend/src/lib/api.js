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

export async function get(chemin, { signal } = {}) {
  let reponse;
  try {
    reponse = await fetch(`${BASE}/api${chemin}`, {
      signal,
      headers: { Accept: 'application/json' },
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    throw new ErreurApi(MESSAGE_INDISPONIBLE);
  }
  if (!reponse.ok) {
    throw new ErreurApi(MESSAGE_INDISPONIBLE, { status: reponse.status });
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
    throw new ErreurApi(
      reponse.status === 429 ? message429 : (donnees.error ?? MESSAGE_INDISPONIBLE),
      { status: reponse.status },
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
    throw new ErreurApi(donnees.error ?? MESSAGE_INDISPONIBLE, { status: reponse.status });
  }
  return {};
}
