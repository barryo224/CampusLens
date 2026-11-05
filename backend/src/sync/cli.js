// Lance un ou plusieurs robots à la main :
//   npm run sync -w backend -- loyers            (un robot)
//   npm run sync -w backend -- all               (tous)
import { creerPrisma } from '../db.js';
import { synchroniser } from './moteur.js';
import { ROBOTS } from './robots/index.js';

const demande = process.argv[2];
const cles = demande === 'all' ? Object.keys(ROBOTS) : [demande];
if (!demande || cles.some((c) => !ROBOTS[c])) {
  console.error(`Usage : npm run sync -w backend -- <${Object.keys(ROBOTS).join('|')}|all>`);
  process.exit(1);
}

const prisma = creerPrisma();
try {
  for (const cle of cles) {
    const resultat = await synchroniser(prisma, ROBOTS[cle]);
    console.log(
      `${cle.padEnd(18)} → ${resultat.statut}${resultat.nbChangements !== undefined ? ` (${resultat.nbChangements} changement(s))` : ''}${resultat.message ? ` — ${resultat.message}` : ''}`,
    );
  }
} finally {
  await prisma.$disconnect();
}
