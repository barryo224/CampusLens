-- CreateEnum
CREATE TYPE "TypeSource" AS ENUM ('api', 'jeu_ouvert', 'moteur_calcul', 'page_web', 'pdf');

-- CreateEnum
CREATE TYPE "StatutSource" AS ENUM ('ok', 'a_verifier', 'erreur');

-- CreateEnum
CREATE TYPE "NiveauEtudes" AS ENUM ('licence', 'master', 'aucun');

-- CreateEnum
CREATE TYPE "CategorieAide" AS ENUM ('logement', 'etudes', 'urgence', 'alimentation');

-- CreateEnum
CREATE TYPE "StatutEligibilite" AS ENUM ('oui', 'sous_conditions', 'non');

-- CreateEnum
CREATE TYPE "StatutLien" AS ENUM ('ok', 'deplace', 'casse');

-- CreateEnum
CREATE TYPE "StatutSynchronisation" AS ENUM ('succes', 'aucun_changement', 'en_attente_validation', 'echec');

-- CreateEnum
CREATE TYPE "StatutChangement" AS ENUM ('a_valider', 'valide', 'rejete');

-- CreateEnum
CREATE TYPE "RoleAdmin" AS ENUM ('admin', 'relecteur');

-- CreateTable
CREATE TABLE "source" (
    "id" SERIAL NOT NULL,
    "nom" TEXT NOT NULL,
    "organisme" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" "TypeSource" NOT NULL,
    "frequence_heures" INTEGER NOT NULL,
    "empreinte" TEXT,
    "dernier_controle" TIMESTAMP(3),
    "dernier_changement" TIMESTAMP(3),
    "statut" "StatutSource" NOT NULL DEFAULT 'a_verifier',
    "licence" TEXT,

    CONSTRAINT "source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annee_universitaire" (
    "id" SERIAL NOT NULL,
    "libelle" TEXT NOT NULL,
    "date_debut" DATE NOT NULL,
    "date_fin" DATE NOT NULL,
    "en_cours" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "annee_universitaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profil" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,

    CONSTRAINT "profil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parametre" (
    "id" SERIAL NOT NULL,
    "cle" TEXT NOT NULL,
    "niveau" "NiveauEtudes" NOT NULL DEFAULT 'aucun',
    "profil_id" INTEGER,
    "annee_id" INTEGER NOT NULL,
    "valeur" DECIMAL(12,2) NOT NULL,
    "unite" TEXT NOT NULL,
    "source_id" INTEGER NOT NULL,
    "verifie_le" TIMESTAMP(3),

    CONSTRAINT "parametre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aide" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "organisme" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categorie" "CategorieAide" NOT NULL,
    "frequence" TEXT NOT NULL,
    "comment_demander" TEXT NOT NULL,
    "lien_demarche" TEXT,
    "code_openfisca" TEXT,
    "source_id" INTEGER NOT NULL,
    "verifie_le" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "aide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eligibilite" (
    "aide_id" INTEGER NOT NULL,
    "profil_id" INTEGER NOT NULL,
    "statut" "StatutEligibilite" NOT NULL,
    "precision" TEXT,

    CONSTRAINT "eligibilite_pkey" PRIMARY KEY ("aide_id","profil_id")
);

-- CreateTable
CREATE TABLE "poste_rentree" (
    "id" SERIAL NOT NULL,
    "annee_id" INTEGER NOT NULL,
    "nom" TEXT NOT NULL,
    "montant" DECIMAL(12,2) NOT NULL,
    "astuce" TEXT,
    "aide_id" INTEGER,
    "source_id" INTEGER NOT NULL,
    "verifie_le" TIMESTAMP(3),

    CONSTRAINT "poste_rentree_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ville" (
    "id" SERIAL NOT NULL,
    "code_insee" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "loyer_m2_appartement" DECIMAL(8,2),
    "loyer_studio_estime" DECIMAL(8,2),
    "nb_logements_crous" INTEGER,
    "abonnement_transport" DECIMAL(8,2),
    "source_id" INTEGER NOT NULL,
    "verifie_le" TIMESTAMP(3),

    CONSTRAINT "ville_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logement_crous" (
    "id" SERIAL NOT NULL,
    "ville_id" INTEGER NOT NULL,
    "nom_residence" TEXT NOT NULL,
    "adresse" TEXT,
    "type_logement" TEXT,
    "loyer_min" DECIMAL(8,2),
    "loyer_max" DECIMAL(8,2),
    "source_id" INTEGER NOT NULL,
    "verifie_le" TIMESTAMP(3),

    CONSTRAINT "logement_crous_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "association" (
    "id" SERIAL NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "lien" TEXT,
    "ville_id" INTEGER,
    "source_id" INTEGER NOT NULL,
    "verifie_le" TIMESTAMP(3),

    CONSTRAINT "association_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ressource" (
    "id" SERIAL NOT NULL,
    "titre" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "categorie" TEXT NOT NULL,
    "organisme" TEXT NOT NULL,
    "annee" TEXT,
    "url" TEXT NOT NULL,
    "empreinte" TEXT,
    "statut_lien" "StatutLien" NOT NULL DEFAULT 'ok',
    "source_id" INTEGER NOT NULL,
    "verifie_le" TIMESTAMP(3),

    CONSTRAINT "ressource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "synchronisation" (
    "id" SERIAL NOT NULL,
    "source_id" INTEGER NOT NULL,
    "debut" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fin" TIMESTAMP(3),
    "statut" "StatutSynchronisation" NOT NULL,
    "nb_changements" INTEGER NOT NULL DEFAULT 0,
    "message_erreur" TEXT,

    CONSTRAINT "synchronisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historique_valeur" (
    "id" SERIAL NOT NULL,
    "table_cible" TEXT NOT NULL,
    "ligne_id" TEXT NOT NULL,
    "champ" TEXT NOT NULL,
    "ancienne_valeur" TEXT,
    "nouvelle_valeur" TEXT,
    "synchronisation_id" INTEGER,
    "change_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historique_valeur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "changement_detecte" (
    "id" SERIAL NOT NULL,
    "source_id" INTEGER NOT NULL,
    "synchronisation_id" INTEGER NOT NULL,
    "resume" TEXT NOT NULL,
    "ancienne_empreinte" TEXT,
    "nouvelle_empreinte" TEXT NOT NULL,
    "table_cible" TEXT,
    "ligne_id" TEXT,
    "champ" TEXT,
    "valeur_proposee" TEXT,
    "statut" "StatutChangement" NOT NULL DEFAULT 'a_valider',
    "traite_par_id" INTEGER,
    "traite_le" TIMESTAMP(3),

    CONSTRAINT "changement_detecte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "administrateur" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "mot_de_passe_hash" TEXT NOT NULL,
    "role" "RoleAdmin" NOT NULL DEFAULT 'relecteur',
    "derniere_connexion" TIMESTAMP(3),

    CONSTRAINT "administrateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_contact" (
    "id" SERIAL NOT NULL,
    "objet" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supprimer_apres" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_contact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "annee_universitaire_libelle_key" ON "annee_universitaire"("libelle");

-- CreateIndex
CREATE UNIQUE INDEX "profil_code_key" ON "profil"("code");

-- CreateIndex
CREATE INDEX "parametre_cle_annee_id_idx" ON "parametre"("cle", "annee_id");

-- CreateIndex
CREATE UNIQUE INDEX "aide_slug_key" ON "aide"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ville_code_insee_key" ON "ville"("code_insee");

-- CreateIndex
CREATE INDEX "synchronisation_source_id_debut_idx" ON "synchronisation"("source_id", "debut");

-- CreateIndex
CREATE INDEX "historique_valeur_table_cible_ligne_id_idx" ON "historique_valeur"("table_cible", "ligne_id");

-- CreateIndex
CREATE UNIQUE INDEX "administrateur_email_key" ON "administrateur"("email");

-- CreateIndex
CREATE INDEX "message_contact_supprimer_apres_idx" ON "message_contact"("supprimer_apres");

-- AddForeignKey
ALTER TABLE "parametre" ADD CONSTRAINT "parametre_profil_id_fkey" FOREIGN KEY ("profil_id") REFERENCES "profil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parametre" ADD CONSTRAINT "parametre_annee_id_fkey" FOREIGN KEY ("annee_id") REFERENCES "annee_universitaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parametre" ADD CONSTRAINT "parametre_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aide" ADD CONSTRAINT "aide_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eligibilite" ADD CONSTRAINT "eligibilite_aide_id_fkey" FOREIGN KEY ("aide_id") REFERENCES "aide"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eligibilite" ADD CONSTRAINT "eligibilite_profil_id_fkey" FOREIGN KEY ("profil_id") REFERENCES "profil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poste_rentree" ADD CONSTRAINT "poste_rentree_annee_id_fkey" FOREIGN KEY ("annee_id") REFERENCES "annee_universitaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poste_rentree" ADD CONSTRAINT "poste_rentree_aide_id_fkey" FOREIGN KEY ("aide_id") REFERENCES "aide"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poste_rentree" ADD CONSTRAINT "poste_rentree_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ville" ADD CONSTRAINT "ville_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logement_crous" ADD CONSTRAINT "logement_crous_ville_id_fkey" FOREIGN KEY ("ville_id") REFERENCES "ville"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logement_crous" ADD CONSTRAINT "logement_crous_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "association" ADD CONSTRAINT "association_ville_id_fkey" FOREIGN KEY ("ville_id") REFERENCES "ville"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "association" ADD CONSTRAINT "association_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ressource" ADD CONSTRAINT "ressource_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "synchronisation" ADD CONSTRAINT "synchronisation_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historique_valeur" ADD CONSTRAINT "historique_valeur_synchronisation_id_fkey" FOREIGN KEY ("synchronisation_id") REFERENCES "synchronisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "changement_detecte" ADD CONSTRAINT "changement_detecte_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "changement_detecte" ADD CONSTRAINT "changement_detecte_synchronisation_id_fkey" FOREIGN KEY ("synchronisation_id") REFERENCES "synchronisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "changement_detecte" ADD CONSTRAINT "changement_detecte_traite_par_id_fkey" FOREIGN KEY ("traite_par_id") REFERENCES "administrateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Unicité d'un paramètre : une seule valeur par (clé, niveau, profil, année).
-- NULLS NOT DISTINCT : deux lignes « sans profil » (valeur nationale) comptent comme identiques.
CREATE UNIQUE INDEX "parametre_unique_cle_niveau_profil_annee"
  ON "parametre" ("cle", "niveau", "profil_id", "annee_id") NULLS NOT DISTINCT;

-- Une seule année universitaire « en cours ».
CREATE UNIQUE INDEX "annee_universitaire_une_seule_en_cours"
  ON "annee_universitaire" ("en_cours") WHERE "en_cours" = true;
