-- Robots de synchronisation : identifiant technique des sources, statut « en_cours » (verrou),
-- et sessions de l'espace admin stockées en base.
-- NB : Prisma proposait aussi de supprimer l'index "parametre_unique_cle_niveau_profil_annee"
-- (créé à la main dans la migration init). On le CONSERVE.

-- AlterEnum
ALTER TYPE "StatutSynchronisation" ADD VALUE 'en_cours';

-- AlterTable
ALTER TABLE "source" ADD COLUMN     "cle" TEXT;

-- CreateTable
CREATE TABLE "session_admin" (
    "sid" TEXT NOT NULL,
    "donnees" JSONB NOT NULL,
    "expire" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_admin_pkey" PRIMARY KEY ("sid")
);

-- CreateIndex
CREATE INDEX "session_admin_expire_idx" ON "session_admin"("expire");

-- CreateIndex
CREATE UNIQUE INDEX "source_cle_key" ON "source"("cle");
