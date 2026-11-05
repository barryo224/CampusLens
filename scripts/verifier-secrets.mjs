// Vérifie qu'aucun secret n'est dans le dépôt : fichiers suivis par Git ET historique des commits.
//   npm run verifier:secrets         (échoue avec un code ≠ 0 au moindre doute ; lancé par la CI)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

// Motifs de secrets courants. Les mots de passe d'exemple évidents (« motdepasse », « campuslens » en CI…) sont tolérés.
const MOTIFS = [
  ['clé privée', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ['clé AWS', /AKIA[0-9A-Z]{16}/],
  ['jeton GitHub', /gh[pousr]_[A-Za-z0-9]{36,}/],
  ['jeton Slack', /xox[baprs]-[A-Za-z0-9-]{10,}/],
  ['clé API (sk-…)', /\bsk-[A-Za-z0-9]{32,}\b/],
  ['jeton JWT', /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/],
  [
    'URL de base avec mot de passe',
    /postgres(?:ql)?:\/\/[^:\s'"]+:(?!motdepasse|campuslens|MOT_DE_PASSE|\$\{|\*+)[^@\s'"]{4,}@(?!localhost:5432\/campuslens_test)/,
  ],
];
// Fichiers qui ne doivent jamais être suivis par Git.
const INTERDITS = [/(^|\/)\.env(\.[^/]+)?$/, /\.pem$/, /\.key$/, /id_rsa/, /\.p12$/];
const AUTORISES = [/\.env\.example$/];
// Valeurs sensibles connues de ce projet : elles ne doivent apparaître nulle part (fichiers ni historique).
const PHRASES_INTERDITES = (process.env.SECRETS_CONNUS ?? '').split('|').filter(Boolean);

const problemes = [];
const fichiers = git('ls-files').split('\n').filter(Boolean);

for (const f of fichiers) {
  if (INTERDITS.some((r) => r.test(f)) && !AUTORISES.some((r) => r.test(f)))
    problemes.push(`fichier sensible suivi par Git : ${f}`);
}

const BINAIRES = /\.(png|jpe?g|webp|pdf|woff2?|ico|gif)$/i;
for (const f of fichiers.filter(
  (x) => !BINAIRES.test(x) && x !== 'package-lock.json' && x !== 'scripts/verifier-secrets.mjs',
)) {
  let texte;
  try {
    texte = readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  for (const [nom, motif] of MOTIFS) if (motif.test(texte)) problemes.push(`${nom} dans ${f}`);
  for (const phrase of PHRASES_INTERDITES)
    if (texte.includes(phrase)) problemes.push(`valeur sensible connue dans ${f}`);
}

// Historique : un secret retiré d'un fichier reste lisible dans les anciens commits.
const historiqueFichiers = git('log', '--all', '--name-only', '--pretty=format:')
  .split('\n')
  .filter(Boolean);
for (const f of new Set(historiqueFichiers)) {
  if (INTERDITS.some((r) => r.test(f)) && !AUTORISES.some((r) => r.test(f)))
    problemes.push(`fichier sensible présent dans l'historique : ${f}`);
}
const historiqueTexte = git(
  'log',
  '--all',
  '-p',
  '--no-color',
  '--pretty=format:%h',
  '--',
  '.',
  ':(exclude)package-lock.json',
  ':(exclude)*.pdf',
  ':(exclude)*.webp',
);
for (const [nom, motif] of MOTIFS)
  if (motif.test(historiqueTexte)) problemes.push(`${nom} dans l'historique Git`);
for (const phrase of PHRASES_INTERDITES)
  if (historiqueTexte.includes(phrase))
    problemes.push('valeur sensible connue dans l’historique Git');

if (problemes.length) {
  console.error('❌ Secrets possibles détectés :\n - ' + [...new Set(problemes)].join('\n - '));
  process.exit(1);
}
console.log(
  `✅ Aucun secret détecté (${fichiers.length} fichiers suivis + historique de ${git('rev-list', '--all', '--count').trim()} commits).`,
);
