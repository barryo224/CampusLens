import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Chiffrement des données personnelles AVANT leur écriture en base (AES-256-GCM).
 *
 * Pourquoi : si quelqu'un obtient une copie de la base (sauvegarde égarée, accès à l'hébergeur, erreur de configuration),
 * les adresses e-mail et les messages ne sont PAS lisibles sans la clé, qui n'est jamais dans la base.
 *
 * Format stocké : « v1.<iv>.<étiquette>.<texte chiffré> » (base64url). L'étiquette d'authentification GCM détecte toute
 * modification : une valeur altérée est refusée au lieu d'être lue de travers. « v1 » permet de changer d'algorithme plus tard.
 * Une valeur sans ce préfixe est du texte ancien (non chiffré) : on la lit telle quelle (voir `npm run donnees:chiffrer`).
 */
const PREFIXE = 'v1.';

/** Une clé de 32 octets, dérivée du secret fourni (n'importe quelle longueur ≥ 16 caractères). */
function deriverCle(secret) {
  if (!secret || String(secret).length < 16)
    throw new Error('La clé de chiffrement (CLE_CHIFFREMENT) doit faire au moins 16 caractères.');
  return createHash('sha256').update(`campuslens:donnees:v1:${secret}`).digest();
}

const b64 = (buf) => buf.toString('base64url');

export function creerChiffreur(secret) {
  const cle = deriverCle(secret);
  return {
    chiffrer(texte) {
      if (texte === null || texte === undefined) return texte;
      const iv = randomBytes(12);
      const chiffre = createCipheriv('aes-256-gcm', cle, iv);
      const donnees = Buffer.concat([chiffre.update(String(texte), 'utf8'), chiffre.final()]);
      return `${PREFIXE}${b64(iv)}.${b64(chiffre.getAuthTag())}.${b64(donnees)}`;
    },
    /** Lit une valeur chiffrée. Texte ancien (sans préfixe) : renvoyé tel quel. Valeur altérée ou mauvaise clé : erreur. */
    dechiffrer(valeur) {
      if (valeur === null || valeur === undefined) return valeur;
      if (!String(valeur).startsWith(PREFIXE)) return valeur;
      const [iv, etiquette, donnees] = String(valeur).slice(PREFIXE.length).split('.');
      if (!iv || !etiquette || donnees === undefined) throw new Error('Valeur chiffrée invalide.');
      const dechiffre = createDecipheriv('aes-256-gcm', cle, Buffer.from(iv, 'base64url'));
      dechiffre.setAuthTag(Buffer.from(etiquette, 'base64url'));
      return Buffer.concat([
        dechiffre.update(Buffer.from(donnees, 'base64url')),
        dechiffre.final(),
      ]).toString('utf8');
    },
    estChiffre: (valeur) => typeof valeur === 'string' && valeur.startsWith(PREFIXE),
  };
}

/**
 * Chiffreur de l'application. En production la clé est OBLIGATOIRE (le serveur refuse de démarrer sans elle) ;
 * en développement et en test, une clé de développement évite toute configuration.
 */
export function chiffreurDepuisEnv({ production = false, cle = process.env.CLE_CHIFFREMENT } = {}) {
  if (production && !cle) throw new Error('CLE_CHIFFREMENT est obligatoire en production.');
  return creerChiffreur(cle ?? 'cle-de-developpement-uniquement-ne-pas-utiliser-en-production');
}
