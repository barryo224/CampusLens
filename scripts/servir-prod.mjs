// Sert le site construit (frontend/dist) COMME EN PRODUCTION, pour les tests :
//  - mêmes en-têtes de sécurité que frontend/vercel.json (une seule source de vérité) ;
//  - compression gzip/brotli ; secours « index.html » pour les routes de l'application ;
//  - /api relayé vers l'API locale (comme le rewrite de Vercel).
// Usage : node scripts/servir-prod.mjs [port]   (après « npm run build -w frontend »)
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('..', import.meta.url));
const dist = join(racine, 'frontend', 'dist');
const port = Number(process.argv[2]) || 4173;
const api = process.env.API_LOCALE ?? 'http://localhost:3001';
const config = JSON.parse(readFileSync(join(racine, 'frontend', 'vercel.json'), 'utf8'));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};
const COMPRESSIBLES = new Set(['.html', '.js', '.css', '.json', '.svg']);
const cache = new Map();

/** En-têtes de vercel.json qui s'appliquent à ce chemin. */
function entetesPour(chemin) {
  const sortie = {};
  for (const { source, headers } of config.headers ?? []) {
    const motif = new RegExp(`^${source.replace('(.*)', '.*')}$`);
    if (motif.test(chemin)) for (const { key, value } of headers) sortie[key] = value;
  }
  return sortie;
}

function servirFichier(req, res, chemin, fichier) {
  const ext = extname(fichier);
  const entetes = {
    'Content-Type': TYPES[ext] ?? 'application/octet-stream',
    ...entetesPour(chemin),
  };
  let corps = readFileSync(fichier);
  const accept = req.headers['accept-encoding'] ?? '';
  if (COMPRESSIBLES.has(ext)) {
    const encodage = accept.includes('br') ? 'br' : accept.includes('gzip') ? 'gzip' : null;
    if (encodage) {
      const cle = `${fichier}:${encodage}`;
      if (!cache.has(cle))
        cache.set(cle, encodage === 'br' ? brotliCompressSync(corps) : gzipSync(corps));
      corps = cache.get(cle);
      entetes['Content-Encoding'] = encodage;
      entetes.Vary = 'Accept-Encoding';
    }
  }
  entetes['Content-Length'] = corps.length;
  res.writeHead(200, entetes);
  res.end(corps);
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      const relais = http.request(
        `${api}${req.url}`,
        { method: req.method, headers: { ...req.headers, host: new URL(api).host } },
        (r) => {
          res.writeHead(r.statusCode, r.headers);
          r.pipe(res);
        },
      );
      relais.on('error', () => {
        res.writeHead(502);
        res.end();
      });
      req.pipe(relais);
      return;
    }
    const demande = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    const fichier = join(dist, demande);
    const existe = fichier.startsWith(dist) && existsSync(fichier) && statSync(fichier).isFile();
    servirFichier(req, res, url.pathname, existe ? fichier : join(dist, 'index.html')); // secours SPA
  })
  .listen(port, () => console.log(`Site de production sur http://localhost:${port}`));
