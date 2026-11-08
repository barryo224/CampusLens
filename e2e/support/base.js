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

/** Prépare le compte admin partagé et un repère pour retrouver (puis effacer) l'avis de test créé par le parcours. */
export async function preparerAvis() {
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
  const repere = `Avis E2E ${Date.now()}`;
  return {
    repere,
    async nettoyer() {
      await prisma.avis.deleteMany({ where: { commentaire: { contains: repere } } });
      await prisma.$disconnect();
    },
  };
}

/** Supprime le compte admin de test (à appeler UNE fois, quand tous les tests du fichier sont finis). */
export async function supprimerAdminDeTest() {
  const prisma = creerPrisma();
  const admin = await prisma.administrateur.findUnique({ where: { email: ADMIN.email } });
  if (admin)
    await prisma.sessionAdmin.deleteMany({
      where: { donnees: { path: ['adminId'], equals: admin.id } },
    });
  await prisma.administrateur.deleteMany({ where: { email: ADMIN.email } });
  await prisma.$disconnect();
}

/** Un compte admin réservé au test de changement de mot de passe (distinct du compte partagé des autres tests). */
export async function preparerAdminCompte() {
  const prisma = creerPrisma();
  const compte = {
    email: 'e2e-compte@campuslens.test',
    motDePasse: 'e2e-ancien-mot-de-passe-2026',
  };
  await prisma.administrateur.upsert({
    where: { email: compte.email },
    update: { motDePasseHash: bcrypt.hashSync(compte.motDePasse, 4), role: 'admin' },
    create: {
      email: compte.email,
      motDePasseHash: bcrypt.hashSync(compte.motDePasse, 4),
      role: 'admin',
    },
  });
  return {
    ...compte,
    async nettoyer() {
      const admin = await prisma.administrateur.findUnique({ where: { email: compte.email } });
      if (admin) {
        await prisma.sessionAdmin.deleteMany({
          where: { donnees: { path: ['adminId'], equals: admin.id } },
        });
        await prisma.administrateur.deleteMany({ where: { id: admin.id } }); // idempotent : un autre navigateur a pu le supprimer avant
      }
      await prisma.$disconnect();
    },
  };
}

/** Une source manuelle de test avec une association à vérifier (supprimées par `nettoyer`). */
export async function preparerDonneeAVerifier() {
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
  const nom = `Source E2E ${Date.now()}`;
  const source = await prisma.source.create({
    data: {
      nom,
      organisme: 'Organisme E2E',
      url: 'https://exemple.test/source',
      type: 'page_web',
      frequenceHeures: 720,
      statut: 'a_verifier',
    },
  });
  const association = await prisma.association.create({
    data: {
      nom: `Association E2E ${source.id}`,
      description: 'Association de test.',
      lien: 'https://exemple.test',
      sourceId: source.id,
    },
  });
  return {
    nom,
    association,
    async nettoyer() {
      await prisma.historiqueValeur.deleteMany({
        where: { tableCible: 'association', ligneId: String(association.id) },
      });
      await prisma.association.deleteMany({ where: { id: association.id } });
      await prisma.source.deleteMany({ where: { id: source.id } });
      await prisma.$disconnect();
    },
  };
}
