import { createHash } from 'node:crypto';

/** Empreinte (hash SHA-256) d'un contenu : sert à détecter qu'une source a changé. */
export const empreinte = (contenu) => createHash('sha256').update(contenu).digest('hex');

/** « Île-de-France » → « ile de france » : comparer des noms de villes sans se soucier des accents. */
export const normaliserNom = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const ENTITES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  euro: '€',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  euml: 'ë',
  agrave: 'à',
  acirc: 'â',
  ocirc: 'ô',
  icirc: 'î',
  iuml: 'ï',
  ucirc: 'û',
  ugrave: 'ù',
  ccedil: 'ç',
  Eacute: 'É',
  laquo: '«',
  raquo: '»',
  rsquo: '’',
  lsquo: '‘',
  hellip: '…',
};
const decoderEntites = (t) =>
  t.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITES[e] ?? ENTITES[e.toLowerCase()] ?? m;
  });

/**
 * Texte lisible d'une page HTML, sans scripts, menus ni pied de page.
 * On compare ce texte (et non le HTML brut) pour ne pas déclencher d'alerte à cause d'un
 * simple changement de mise en page ou d'un identifiant de suivi.
 */
export function texteDepuisHtml(html) {
  let h = String(html);
  const main = h.match(/<main[\s>][\s\S]*?<\/main>/i);
  if (main) h = main[0];
  h = h
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|br|td|th)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  // Deux passes : certaines pages contiennent des entités déjà encodées (« &amp;eacute; »).
  h = decoderEntites(decoderEntites(h));
  return h
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** Lecture d'un CSV à séparateur configurable, avec guillemets (RFC 4180 simplifié). */
export function lireCsv(texte, { separateur = ';' } = {}) {
  const lignes = [];
  let champ = '';
  let ligne = [];
  let guillemets = false;
  const t = texte.charCodeAt(0) === 0xfeff ? texte.slice(1) : texte; // retire le BOM éventuel
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (guillemets) {
      if (c === '"' && t[i + 1] === '"') {
        champ += '"';
        i++;
      } else if (c === '"') guillemets = false;
      else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === separateur) {
      ligne.push(champ);
      champ = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      ligne.push(champ);
      champ = '';
      if (ligne.some((x) => x !== '')) lignes.push(ligne);
      ligne = [];
    } else champ += c;
  }
  ligne.push(champ);
  if (ligne.some((x) => x !== '')) lignes.push(ligne);
  if (lignes.length === 0) return [];
  const [entete, ...corps] = lignes;
  return corps.map((l) => Object.fromEntries(entete.map((nom, i) => [nom, l[i] ?? ''])));
}

/** « 9,75 » → 9.75 ; renvoie NaN si ce n'est pas un nombre. */
export const nombreFr = (t) =>
  /^-?\d+([.,]\d+)?$/.test(String(t).trim()) ? Number(String(t).trim().replace(',', '.')) : NaN;

export const arrondir2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
