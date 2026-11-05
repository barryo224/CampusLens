/** Erreur « la source ne répond pas comme prévu » : le robot s'arrête sans rien modifier. */
export class ErreurSource extends Error {
  constructor(message, { cause } = {}) {
    super(message, { cause });
    this.name = 'ErreurSource';
  }
}

const AGENT = 'CampusLens-robot/1.0 (projet étudiant ; données publiques)';

/**
 * Télécharge une adresse. `fetchImpl` est injectable : les tests simulent les sources.
 * Lève ErreurSource si la source est injoignable (délai dépassé, 4xx/5xx).
 */
export async function telecharger(
  url,
  { fetchImpl = fetch, delaiMs = 30_000, binaire = false } = {},
) {
  let reponse;
  try {
    reponse = await fetchImpl(url, {
      headers: { 'User-Agent': AGENT, Accept: '*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(delaiMs),
    });
  } catch (e) {
    throw new ErreurSource(
      `Source injoignable (${e?.name === 'TimeoutError' ? 'délai dépassé' : 'erreur réseau'}) : ${url}`,
      { cause: e },
    );
  }
  if (!reponse.ok) throw new ErreurSource(`La source a répondu ${reponse.status} : ${url}`);
  return binaire
    ? {
        statut: reponse.status,
        octets: new Uint8Array(await reponse.arrayBuffer()),
        url: reponse.url || url,
        redirige: Boolean(reponse.redirected),
      }
    : {
        statut: reponse.status,
        texte: await reponse.text(),
        url: reponse.url || url,
        redirige: Boolean(reponse.redirected),
      };
}
