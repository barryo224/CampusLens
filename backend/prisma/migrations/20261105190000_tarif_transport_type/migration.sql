-- Nature du tarif de transport : réservé aux étudiants (justificatif d'études), ou tarif « jeunes » ouvert à tout
-- le monde dans la tranche d'âge (aucune condition d'études).
ALTER TABLE "tarif_transport" ADD COLUMN "type_tarif" TEXT NOT NULL DEFAULT 'jeunes';
ALTER TABLE "tarif_transport" ADD CONSTRAINT "tarif_transport_type_tarif_valide" CHECK ("type_tarif" IN ('etudiant', 'jeunes'));
