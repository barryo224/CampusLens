import { verifierAdresseExterne } from '../lib/securite.js';

/** Erreur « la source ne répond pas comme prévu » : le robot s'arrête sans rien modifier. */
export class ErreurSource extends Error {
  constructor(message, { cause } = {}) {
    super(message, { cause });
    this.name = 'ErreurSource';
  }
}

const MAX_REDIRECTIONS = 5;
/** Une source ne peut pas nous envoyer plus que cela (le serveur gratuit n'a que 512 Mo de mémoire). */
export const TAILLE_MAX_TEXTE = 8 * 1024 * 1024;
export const TAILLE_MAX_BINAIRE = 64 * 1024 * 1024;
const AGENT = 'CampusLens-robot/1.0 (projet étudiant ; données publiques)';

/**
 * Télécharge une adresse. `fetchImpl` est injectable : les tests simulent les sources.
 * Lève ErreurSource si la source est injoignable (délai dépassé, 4xx/5xx).
 */
export async function telecharger(
  url,
  {
    fetchImpl = fetch,
    delaiMs = 30_000,
    binaire = false,
    tailleMax = binaire ? TAILLE_MAX_BINAIRE : TAILLE_MAX_TEXTE,
  } = {},
) {
  // Protection SSRF : on ne suit JAMAIS une adresse interne, ni directement ni par une redirection. Les redirections sont
  // suivies à la main (5 au maximum) pour vérifier chaque étape AVANT de la contacter. Le nom de domaine est aussi résolu
  // pour vérifier qu'il ne pointe pas vers le réseau interne (sauf avec un faux `fetch` de test).
  const verifierDns = fetchImpl === fetch;
  let courant = url;
  let sauts = 0;
  let reponse;
  for (;;) {
    try {
      await verifierAdresseExterne(courant, { verifierDns });
    } catch (e) {
      throw new ErreurSource(`Adresse non autorisée : ${String(courant).slice(0, 80)}`, {
        cause: e,
      });
    }
    try {
      reponse = await fetchImpl(courant, {
        headers: { 'User-Agent': AGENT, Accept: '*/*' },
        redirect: 'manual',
        signal: AbortSignal.timeout(delaiMs),
      });
    } catch (e) {
      throw new ErreurSource(
        `Source injoignable (${e?.name === 'TimeoutError' ? 'délai dépassé' : 'erreur réseau'}) : ${url}`,
        { cause: e },
      );
    }
    const suite =
      reponse.status >= 300 && reponse.status < 400 ? reponse.headers?.get?.('location') : null;
    if (!suite) break;
    if (++sauts > MAX_REDIRECTIONS) throw new ErreurSource(`Trop de redirections : ${url}`);
    try {
      courant = new URL(suite, courant).href;
    } catch {
      throw new ErreurSource(`Redirection invalide : ${url}`);
    }
  }
  if (!reponse.ok) throw new ErreurSource(`La source a répondu ${reponse.status} : ${url}`);
  const annoncee = Number(reponse.headers?.get?.('content-length'));
  if (annoncee > tailleMax)
    throw new ErreurSource(
      `Fichier trop volumineux (${Math.round(annoncee / 1_048_576)} Mo) : ${url}`,
    );
  // Lecture d'un en-tête de réponse (ex. la version du moteur de calcul).
  const entete = (nom) => reponse.headers?.get?.(nom) ?? null;
  const commun = {
    statut: reponse.status,
    url: sauts > 0 ? courant : reponse.url || url,
    redirige: sauts > 0 || Boolean(reponse.redirected),
    entete,
  };
  const octets = await lireAvecLimite(reponse, tailleMax, url);
  return binaire ? { ...commun, octets } : { ...commun, texte: new TextDecoder().decode(octets) };
}

/**
 * Lit le corps de la réponse en s'arrêtant dès que la limite est dépassée (un serveur qui n'annonce pas sa taille ne peut
 * pas saturer la mémoire). Les faux `fetch` des tests n'ont pas de flux : on lit alors le corps d'un bloc, puis on mesure.
 */
async function lireAvecLimite(reponse, tailleMax, url) {
  const trop = () =>
    new ErreurSource(
      `Fichier trop volumineux (plus de ${Math.round(tailleMax / 1_048_576)} Mo) : ${url}`,
    );
  const lecteur = reponse.body?.getReader?.();
  if (!lecteur) {
    const octets = reponse.arrayBuffer
      ? new Uint8Array(await reponse.arrayBuffer())
      : new TextEncoder().encode(await reponse.text());
    if (octets.byteLength > tailleMax) throw trop();
    return octets;
  }
  const morceaux = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    total += value.byteLength;
    if (total > tailleMax) {
      await lecteur.cancel().catch(() => {});
      throw trop();
    }
    morceaux.push(value);
  }
  const tout = new Uint8Array(total);
  let position = 0;
  for (const m of morceaux) {
    tout.set(m, position);
    position += m.byteLength;
  }
  return tout;
}
