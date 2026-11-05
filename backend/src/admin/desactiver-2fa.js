// Secours : retire la double authentification d'un compte (téléphone perdu ET codes de secours perdus).
//   npm run admin:desactiver-2fa -- adresse@exemple.fr
// Réservé à qui a accès au serveur : c'est volontaire, aucune page du site ne permet de contourner la double authentification.
import { creerPrisma } from '../db.js';

const email = process.argv[2]?.toLowerCase();
if (!email) {
  console.error('Usage : npm run admin:desactiver-2fa -- adresse@exemple.fr');
  process.exit(1);
}
const prisma = creerPrisma();
try {
  const { count } = await prisma.administrateur.updateMany({
    where: { email },
    data: { totpSecret: null, totpActifLe: null, totpDernierPas: null, codesSecours: [] },
  });
  if (count === 0) {
    console.error(`Aucun compte pour ${email}.`);
    process.exitCode = 1;
  } else {
    console.log(
      `Double authentification retirée pour ${email}. Réactivez-la dès la connexion suivante.`,
    );
  }
} finally {
  await prisma.$disconnect();
}
