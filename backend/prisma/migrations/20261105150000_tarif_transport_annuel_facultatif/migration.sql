-- Certains réseaux (ex. Nancy) n'ont qu'un abonnement mensuel : le prix annuel devient facultatif.
ALTER TABLE "tarif_transport" ALTER COLUMN "montant_annuel" DROP NOT NULL;
