-- Prix du pass mensuel étudiant (sans engagement), en plus du prix annuel.
ALTER TABLE "tarif_transport" ADD COLUMN "montant_mensuel" DECIMAL(8,2);
