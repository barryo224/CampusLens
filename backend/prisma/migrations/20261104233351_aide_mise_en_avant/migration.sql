-- Aide mise en avant sur l'accueil (bloc « Les aides à connaître »).
-- NB : Prisma proposait de supprimer l'index "parametre_unique_cle_niveau_profil_annee"
-- (créé à la main dans la migration init, qu'il ne sait pas décrire). On le CONSERVE.

-- AlterTable
ALTER TABLE "aide" ADD COLUMN     "mise_en_avant" BOOLEAN NOT NULL DEFAULT false;
