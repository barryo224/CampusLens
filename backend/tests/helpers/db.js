import { creerPrisma } from '../../src/db.js';

export function prismaTest() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL manquante (voir backend/.env.example).');
  return creerPrisma(url);
}

// Tables à vider entre deux tests. Liste fixe : aucune entrée utilisateur dans cette requête.
const TABLES = [
  'changement_detecte',
  'historique_valeur',
  'synchronisation',
  'message_contact',
  'administrateur',
  'ressource',
  'association',
  'logement_crous',
  'ville',
  'poste_rentree',
  'eligibilite',
  'aide',
  'parametre',
  'profil',
  'annee_universitaire',
  'source',
];

export async function viderBase(prisma) {
  const liste = TABLES.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${liste} RESTART IDENTITY CASCADE`);
}
