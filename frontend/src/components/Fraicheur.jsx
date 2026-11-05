import { formaterDate } from '../lib/format.js';

/**
 * Source + date de vérification d'une donnée, avec la mention « vérification en cours »
 * quand la donnée n'a pas été confirmée récemment (spec : chaque valeur affiche sa source).
 */
export default function Fraicheur({ source, verifieLe, aVerifier }) {
  return (
    <p className="fraicheur">
      Source : {source?.organisme ?? 'non précisée'}
      {verifieLe && <> · vérifié le {formaterDate(verifieLe)}</>}
      {aVerifier && <span className="a-verifier">vérification en cours</span>}
    </p>
  );
}
