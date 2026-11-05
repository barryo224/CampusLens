// Préparation et nettoyage de la base pour les tests de bout en bout qui ont besoin de données
// précises (un administrateur, un changement à valider). Tout est remis en l'état à la fin.
import bcrypt from 'bcrypt';
import { creerPrisma } from '../../backend/src/db.js';

try {
  process.loadEnvFile(new URL('../../backend/.env', import.meta.url));
} catch {
  /* en CI, les variables viennent de l'environnement */
}

export const ADMIN = {
  email: 'e2e-admin@campuslens.test',
  motDePasse: 'e2e-mot-de-passe-solide-2026',
};

export async function preparerChangementCvec() {
  const prisma = creerPrisma();
  const source = await prisma.source.findUniqueOrThrow({ where: { cle: 'cvec' } });
  const param = await prisma.parametre.findFirstOrThrow({
    where: { sourceId: source.id, cle: 'cvec', annee: { enCours: true } },
  });
  const valeurInitiale = Number(param.valeur);
  const valeurProposee = valeurInitiale + 1;

  await prisma.administrateur.upsert({
    where: { email: ADMIN.email },
    update: { motDePasseHash: bcrypt.hashSync(ADMIN.motDePasse, 4), role: 'admin' },
    create: {
      email: ADMIN.email,
      motDePasseHash: bcrypt.hashSync(ADMIN.motDePasse, 4),
      role: 'admin',
    },
  });
  const passage = await prisma.synchronisation.create({
    data: {
      sourceId: source.id,
      statut: 'en_attente_validation',
      fin: new Date(),
      nbChangements: 1,
    },
  });
  const changement = await prisma.changementDetecte.create({
    data: {
      sourceId: source.id,
      synchronisationId: passage.id,
      resume: 'Test E2E : la page de la CVEC a changé.',
      nouvelleEmpreinte: `e2e-${Date.now()}`,
      tableCible: 'parametre',
      champ: 'valeur',
      valeurProposee: JSON.stringify([
        {
          parametreId: param.id,
          cle: 'cvec',
          niveau: 'aucun',
          profil: null,
          annee: '2026-2027',
          valeurActuelle: valeurInitiale,
          valeur: valeurProposee,
        },
      ]),
    },
  });
  return {
    valeurInitiale,
    valeurProposee,
    async nettoyer() {
      await prisma.historiqueValeur.deleteMany({ where: { synchronisationId: passage.id } });
      await prisma.changementDetecte.deleteMany({ where: { id: changement.id } });
      await prisma.synchronisation.deleteMany({ where: { id: passage.id } });
      await prisma.parametre.update({
        where: { id: param.id },
        data: { valeur: valeurInitiale, verifieLe: param.verifieLe },
      });
      await prisma.source.update({
        where: { id: source.id },
        data: { empreinte: source.empreinte },
      });
      await prisma.$disconnect();
    },
  };
}

/** Un compte admin + un message de contact de test (supprimés par `nettoyer`, même si le test échoue). */
export async function preparerMessageContact() {
  const prisma = creerPrisma();
  await prisma.administrateur.upsert({
    where: { email: ADMIN.email },
    update: { motDePasseHash: bcrypt.hashSync(ADMIN.motDePasse, 4), role: 'admin' },
    create: {
      email: ADMIN.email,
      motDePasseHash: bcrypt.hashSync(ADMIN.motDePasse, 4),
      role: 'admin',
    },
  });
  const objet = `Message E2E ${Date.now()}`;
  await prisma.messageContact.create({
    data: {
      objet,
      email: 'e2e-etudiant@exemple.fr',
      message: 'Bonjour, ceci est un test.',
      supprimerApres: new Date(Date.now() + 86_400_000),
    },
  });
  return {
    objet,
    async nettoyer() {
      await prisma.messageContact.deleteMany({ where: { objet } });
      await prisma.$disconnect();
    },
  };
}

/** Supprime le compte admin de test (à appeler UNE fois, quand tous les tests du fichier sont finis). */
export async function supprimerAdminDeTest() {
  const prisma = creerPrisma();
  await prisma.administrateur.deleteMany({ where: { email: ADMIN.email } });
  await prisma.$disconnect();
}
