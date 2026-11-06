-- Certains sites (réseaux de transport, services de l'État) refusent les robots du serveur (403, connexion coupée).
-- On le retient pour que la vérification humaine reste valable (90 jours) au lieu d'être annulée par chaque échec du robot.
ALTER TABLE "source" ADD COLUMN "bloque_robot" BOOLEAN NOT NULL DEFAULT false;
