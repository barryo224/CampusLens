-- Abonnement de transport étudiant par ville, avec sa source officielle et sa date de vérification.
-- NB : on n'utilise pas la proposition automatique de Prisma, qui supprimerait nos index créés à la main.
CREATE TABLE "tarif_transport" (
    "id" SERIAL NOT NULL,
    "ville_id" INTEGER NOT NULL,
    "reseau" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "montant_annuel" DECIMAL(8,2) NOT NULL,
    "conditions" TEXT,
    "url_tarifs" TEXT NOT NULL,
    "source_id" INTEGER NOT NULL,
    "verifie_le" TIMESTAMP(3),

    CONSTRAINT "tarif_transport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tarif_transport_ville_id_key" ON "tarif_transport"("ville_id");

ALTER TABLE "tarif_transport" ADD CONSTRAINT "tarif_transport_ville_id_fkey" FOREIGN KEY ("ville_id") REFERENCES "ville"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tarif_transport" ADD CONSTRAINT "tarif_transport_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
