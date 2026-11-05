import { verifierAdresseExterne } from '../lib/securite.js';

/** Erreur « la source ne répond pas comme prévu » : le robot s'arrête sans rien modifier. */
export class ErreurSource extends Error {
  constructor(message, { cause } = {}) {
    super(message, { cause });
    this.name = 'ErreurSource';
  }
}

const MAX_REDIRECTIONS = 5;
const AGENT = 'CampusLens-robot/1.0 (projet étudiant ; données publiques)';

/**
 * Télécharge une adresse. `fetchImpl` est injectable : les tests simulent les sources.
 * Lève ErreurSource si la source est injoignable (délai dépassé, 4xx/5xx).
 */
export async function telecharger(
  url,
  { fetchImpl = fetch, delaiMs = 30_000, binaire = false } = {},
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
  // Lecture d'un en-tête de réponse (ex. la version du moteur de calcul).
  const entete = (nom) => reponse.headers?.get?.(nom) ?? null;
  const commun = {
    statut: reponse.status,
    url: sauts > 0 ? courant : reponse.url || url,
    redirige: sauts > 0 || Boolean(reponse.redirected),
    entete,
  };
  return binaire
    ? { ...commun, octets: new Uint8Array(await reponse.arrayBuffer()) }
    : { ...commun, texte: await reponse.text() };
}
