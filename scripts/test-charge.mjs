// Test de charge : de nombreux visiteurs simultanés sur l'API (lectures publiques, comme le site réel).
//   node scripts/test-charge.mjs [adresse] [secondes par palier] [paliers de visiteurs simultanés, séparés par des virgules]
//   ex. : node scripts/test-charge.mjs http://localhost:3101 10 10,50,100,200
// Chaque « visiteur » enchaîne des requêtes (comme quelqu'un qui navigue), sans aucune pause, ce qui est plus dur que la réalité.
// Aucune dépendance : http natif de Node. Le test LIT seulement (aucune écriture en base).
import http from 'node:http';

const BASE = new URL(process.argv[2] ?? 'http://localhost:3101');
const SECONDES = Number(process.argv[3] ?? 10);
// Comme un vrai navigateur : il demande les réponses compressées (la charge de compression pèse donc sur le serveur).
const RAMPE_MS = Number(process.env.RAMPE_MS ?? 0);
const COMPRESSE = process.env.SANS_COMPRESSION !== '1';
const PALIERS = (process.argv[4] ?? '10,50,100,200').split(',').map(Number);

// Les pages du site chargent ces données ; les plus lourdes (villes, aides) pèsent davantage.
const REQUETES = [
  ['/api/villes', 3],
  ['/api/aides', 3],
  ['/api/aides?miseEnAvant=true', 2],
  ['/api/parametres?annee=en_cours', 3],
  ['/api/postes-rentree?profil=fr_ue&niveau=licence', 2],
  ['/api/postes-rentree?profil=intl&niveau=master&situation=arrivee', 1],
  ['/api/ressources', 2],
  ['/api/associations', 1],
  ['/api/sources', 1],
  ['/api/health', 1],
];
const TIRAGE = REQUETES.flatMap(([chemin, poids]) => Array(poids).fill(chemin));
const percentile = (tries, p) =>
  tries[Math.min(tries.length - 1, Math.floor((tries.length * p) / 100))];

async function palier(visiteurs) {
  const agent = new http.Agent({ keepAlive: true, maxSockets: visiteurs });
  const latences = [];
  const codes = new Map();
  const erreurs = new Map();
  const fin = Date.now() + SECONDES * 1000;

  const requete = (chemin) =>
    new Promise((resolve) => {
      const debut = performance.now();
      const r = http.get(
        {
          host: BASE.hostname,
          port: BASE.port,
          path: chemin,
          agent,
          timeout: 30_000,
          headers: { 'Accept-Encoding': COMPRESSE ? 'gzip' : 'identity' },
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve({ code: res.statusCode, ms: performance.now() - debut }));
        },
      );
      r.on('timeout', () => r.destroy(new Error('délai dépassé (30 s)')));
      r.on('error', (e) => resolve({ erreur: e.code ?? e.message, ms: performance.now() - debut }));
    });

  // RAMPE_MS : délai entre l'arrivée de deux visiteurs (0 = tous d'un coup, le cas le plus dur pour le système).
  async function visiteur(rang) {
    if (RAMPE_MS) await new Promise((ok) => setTimeout(ok, rang * RAMPE_MS));
    while (Date.now() < fin) {
      const chemin = TIRAGE[Math.floor(Math.random() * TIRAGE.length)];
      const { code, erreur, ms } = await requete(chemin);
      if (erreur) erreurs.set(erreur, (erreurs.get(erreur) ?? 0) + 1);
      else {
        codes.set(code, (codes.get(code) ?? 0) + 1);
        latences.push(ms);
      }
    }
  }
  const debut = Date.now();
  await Promise.all(Array.from({ length: visiteurs }, (_, rang) => visiteur(rang)));
  agent.destroy();
  const duree = (Date.now() - debut) / 1000;
  latences.sort((a, b) => a - b);
  const total =
    [...codes.values()].reduce((a, b) => a + b, 0) +
    [...erreurs.values()].reduce((a, b) => a + b, 0);
  return { visiteurs, total, parSeconde: Math.round(total / duree), codes, erreurs, latences };
}

const ms = (n) => (n === undefined ? '—' : `${Math.round(n)} ms`);
console.log(
  `Test de charge : ${BASE.origin}, ${SECONDES} s par palier, ${COMPRESSE ? 'avec' : 'sans'} compression\n`,
);
console.log('visiteurs  requêtes/s   médiane    p95       p99      max       réponses');
let problemes = 0;
for (const visiteurs of PALIERS) {
  const r = await palier(visiteurs);
  const ok = r.codes.get(200) ?? 0;
  const autres = [...r.codes].filter(([c]) => c !== 200).map(([c, n]) => `${c}×${n}`);
  const errs = [...r.erreurs].map(([e, n]) => `${e}×${n}`);
  if (autres.length || errs.length) problemes++;
  console.log(
    `${String(visiteurs).padEnd(10)} ${String(r.parSeconde).padEnd(12)} ${ms(percentile(r.latences, 50)).padEnd(10)} ${ms(percentile(r.latences, 95)).padEnd(9)} ${ms(percentile(r.latences, 99)).padEnd(8)} ${ms(r.latences.at(-1)).padEnd(9)} ${ok}×200${autres.length ? ' ' + autres.join(' ') : ''}${errs.length ? ' ERREURS ' + errs.join(' ') : ''}`,
  );
}
console.log(
  problemes
    ? '\n⚠️  Des réponses anormales ou des erreurs sont apparues.'
    : '\n✅ Aucune erreur : toutes les réponses sont des 200.',
);
process.exit(problemes ? 1 : 0);
