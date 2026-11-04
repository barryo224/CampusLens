// Crée (ou met à jour) un compte administrateur.
// Usage : ADMIN_EMAIL=moi@exemple.fr ADMIN_PASSWORD='un mot de passe long' npm run admin:creer -w backend
// Le mot de passe n'est jamais écrit dans un fichier ni dans l'historique du dépôt.
import bcrypt from 'bcrypt';
import { creerPrisma } from '../db.js';

const email = process.env.ADMIN_EMAIL?.toLowerCase();
const motDePasse = process.env.ADMIN_PASSWORD;
if (!email || !motDePasse || motDePasse.length < 12) {
  console.error('Définir ADMIN_EMAIL et ADMIN_PASSWORD (12 caractères minimum).');
  process.exit(1);
}

const prisma = creerPrisma();
try {
  const motDePasseHash = await bcrypt.hash(motDePasse, 12);
  await prisma.administrateur.upsert({
    where: { email },
    update: { motDePasseHash },
    create: { email, motDePasseHash, role: 'admin' },
  });
  console.log(`Administrateur ${email} prêt.`);
} finally {
  await prisma.$disconnect();
}
