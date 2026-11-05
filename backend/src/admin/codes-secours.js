import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Codes de secours de la double authentification : à utiliser si l'on perd son téléphone. Chacun ne sert qu'UNE fois.
 * On ne garde jamais le code, seulement son empreinte (scrypt, volontairement lent : une copie de la base ne permet pas
 * de retrouver les codes). Format affiché : XXXXX-XXXXX (alphabet sans caractères ambigus).
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const NB_CODES_SECOURS = 8;

const normaliser = (code) =>
  String(code ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

export function genererCodesSecours(nombre = NB_CODES_SECOURS) {
  return Array.from({ length: nombre }, () => {
    const brut = Array.from(randomBytes(10), (o) => ALPHABET[o % ALPHABET.length]).join('');
    return `${brut.slice(0, 5)}-${brut.slice(5)}`;
  });
}

export function empreinteCode(code) {
  const sel = randomBytes(16);
  return `${sel.toString('hex')}:${scryptSync(normaliser(code), sel, 32).toString('hex')}`;
}

/** Renvoie la position du code dans la liste d'empreintes, ou -1. */
export function trouverCode(empreintes, saisie) {
  const code = normaliser(saisie);
  if (code.length !== 10) return -1;
  for (let i = 0; i < empreintes.length; i++) {
    const [sel, attendu] = String(empreintes[i]).split(':');
    const calcule = scryptSync(code, Buffer.from(sel, 'hex'), 32);
    const a = Buffer.from(attendu, 'hex');
    if (a.length === calcule.length && timingSafeEqual(a, calcule)) return i;
  }
  return -1;
}
