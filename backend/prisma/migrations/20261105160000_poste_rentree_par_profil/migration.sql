-- Budget de rentrée par profil : le montant d'un poste peut venir d'un paramètre, être gratuit pour un boursier,
-- ou n'exister que pour un profil / une situation (taxe de visa des étudiants étrangers qui arrivent).
ALTER TABLE "poste_rentree" ADD COLUMN "parametre_cle" TEXT;
ALTER TABLE "poste_rentree" ADD COLUMN "gratuit_boursier" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "poste_rentree" ADD COLUMN "profil_code" TEXT;
ALTER TABLE "poste_rentree" ADD COLUMN "situation" TEXT;
