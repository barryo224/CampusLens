import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Mots de passe à usage unique basés sur le temps (TOTP, RFC 6238), compatibles avec Google Authenticator, Microsoft
 * Authenticator, Aegis, 1Password, Bitwarden, FreeOTP… Implémentation volontairement courte et sans dépendance.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // base32 (RFC 4648)

export function encoderBase32(octets) {
  let bits = 0;
  let valeur = 0;
  let sortie = '';
  for (const o of octets) {
    valeur = (valeur << 8) | o;
    bits += 8;
    while (bits >= 5) {
      sortie += ALPHABET[(valeur >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) sortie += ALPHABET[(valeur << (5 - bits)) & 31];
  return sortie;
}

export function decoderBase32(texte) {
  const propre = String(texte)
    .replace(/[\s=-]/g, '')
    .toUpperCase();
  let bits = 0;
  let valeur = 0;
  const octets = [];
  for (const c of propre) {
    const i = ALPHABET.indexOf(c);
    if (i === -1) throw new Error('Clé invalide.');
    valeur = (valeur << 5) | i;
    bits += 5;
    if (bits >= 8) {
      octets.push((valeur >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(octets);
}

/** Nouvelle clé secrète : 20 octets aléatoires (160 bits), écrite en base32. */
export const genererSecret = () => encoderBase32(randomBytes(20));

const PERIODE_S = 30;

/** Le « pas » de 30 secondes qui contient cet instant. */
export const pasDeTemps = (maintenantMs = Date.now()) =>
  Math.floor(maintenantMs / 1000 / PERIODE_S);

/** Code à `chiffres` chiffres pour un pas donné (RFC 4226, troncature dynamique). */
export function codePourPas(secretBase32, pas, chiffres = 6) {
  const compteur = Buffer.alloc(8);
  compteur.writeBigUInt64BE(BigInt(pas));
  const h = createHmac('sha1', decoderBase32(secretBase32)).update(compteur).digest();
  const decalage = h[h.length - 1] & 0xf;
  const code =
    (((h[decalage] & 0x7f) << 24) |
      (h[decalage + 1] << 16) |
      (h[decalage + 2] << 8) |
      h[decalage + 3]) %
    10 ** chiffres;
  return String(code).padStart(chiffres, '0');
}

const memeTexte = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Le code saisi est-il valable ? On accepte le pas courant et celui d'avant/après (décalage d'horloge d'une trentaine de
 * secondes). `dernierPas` : le dernier pas déjà utilisé avec succès. Un code ne sert qu'UNE fois (anti-rejeu) : renvoie
 * le pas accepté, ou null.
 */
export function verifierCode(
  secretBase32,
  saisie,
  { maintenantMs = Date.now(), dernierPas = null } = {},
) {
  const code = String(saisie ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return null;
  const courant = pasDeTemps(maintenantMs);
  for (const pas of [courant, courant - 1, courant + 1]) {
    if (dernierPas !== null && pas <= dernierPas) continue; // déjà utilisé, ou plus ancien
    if (memeTexte(codePourPas(secretBase32, pas), code)) return pas;
  }
  return null;
}

/** Adresse « otpauth » : certaines applications l'ouvrent directement (sinon on saisit la clé à la main). */
export function adresseOtpauth({ secret, email, emetteur = 'CampusLens' }) {
  const etiquette = encodeURIComponent(`${emetteur}:${email}`);
  return `otpauth://totp/${etiquette}?secret=${secret}&issuer=${encodeURIComponent(emetteur)}&algorithm=SHA1&digits=6&period=${PERIODE_S}`;
}

/** La clé écrite par groupes de 4 caractères, plus lisible à recopier. */
export const formaterSecret = (secret) => secret.match(/.{1,4}/g).join(' ');
