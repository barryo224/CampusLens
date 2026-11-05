import net from 'node:net';
import dns from 'node:dns/promises';

/** Méthodes qui modifient des données : elles exigent une origine de confiance (protection contre la forgerie inter-sites). */
export const METHODES_ECRITURE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * L'origine d'une requête d'écriture est-elle de confiance ?
 *  - oui si elle figure dans la liste des sites autorisés (CORS_ORIGIN) ;
 *  - oui si elle vient du même serveur (même hôte) ;
 *  - sinon non : c'est un autre site qui essaie d'agir au nom d'un visiteur ou d'un administrateur connecté.
 */
export function origineAutorisee({ origin, host, autorisees = [] }) {
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false; // « null », valeur absurde : refusée
  }
  const normalisee = url.origin;
  if (autorisees.some((a) => a.replace(/\/+$/, '') === normalisee)) return true;
  return Boolean(host) && url.host === host;
}

// Plages d'adresses qui ne sont JAMAIS un site public : réseau local, boucle locale, adresses de service des hébergeurs.
const INTERDITES = new net.BlockList();
for (const [adresse, bits] of [
  ['0.0.0.0', 8], // « cet appareil »
  ['10.0.0.0', 8], // réseau privé
  ['100.64.0.0', 10], // réseau partagé des opérateurs
  ['127.0.0.0', 8], // boucle locale (localhost)
  ['169.254.0.0', 16], // adresses « lien local » : dont les données d'identification des hébergeurs cloud (169.254.169.254)
  ['172.16.0.0', 12], // réseau privé
  ['192.0.0.0', 24],
  ['192.168.0.0', 16], // réseau privé
  ['198.18.0.0', 15],
  ['224.0.0.0', 4], // multidiffusion
  ['240.0.0.0', 4], // réservé
]) {
  INTERDITES.addSubnet(adresse, bits, 'ipv4');
}
for (const [adresse, bits] of [
  ['::', 128],
  ['::1', 128], // boucle locale
  ['fc00::', 7], // réseau privé
  ['fe80::', 10], // lien local
  ['ff00::', 8], // multidiffusion
]) {
  INTERDITES.addSubnet(adresse, bits, 'ipv6');
}

/** Une adresse IP (v4 ou v6) est-elle interne ou réservée ? Les adresses IPv4 écrites en IPv6 (::ffff:127.0.0.1) sont vues. */
export function adresseInterne(ip) {
  const mappee = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  const nette = mappee ? mappee[1] : ip;
  const famille = net.isIP(nette);
  if (!famille) return false;
  return INTERDITES.check(nette, famille === 4 ? 'ipv4' : 'ipv6');
}

const SUFFIXES_INTERNES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa', '.intranet'];

/**
 * Refuse une adresse qu'un robot ne doit jamais interroger (SSRF) : autre schéma que http(s), nom interne,
 * adresse IP interne, ou nom de domaine qui POINTE vers une adresse interne (vérifié si `verifierDns`).
 * Lève une Error « adresse non autorisée ».
 */
export async function verifierAdresseExterne(url, { verifierDns = false } = {}) {
  const u = url instanceof URL ? url : new URL(url);
  if (!['http:', 'https:'].includes(u.protocol))
    throw new Error(`schéma non autorisé : ${u.protocol}`);
  const hote = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const interne =
    hote === 'localhost' ||
    SUFFIXES_INTERNES.some((s) => hote.endsWith(s)) ||
    (!net.isIP(hote) && !hote.includes('.')) || // nom sans point (« intranet », « db »)
    adresseInterne(hote);
  if (interne) throw new Error('adresse non autorisée (réseau interne)');
  if (verifierDns && !net.isIP(hote)) {
    let adresses = [];
    try {
      adresses = await dns.lookup(hote, { all: true });
    } catch {
      return; // nom introuvable : la requête échouera d'elle-même (« source injoignable »)
    }
    if (adresses.some((a) => adresseInterne(a.address)))
      throw new Error('adresse non autorisée (le nom pointe vers le réseau interne)');
  }
}
