-- Double authentification (TOTP) des administrateurs : la clé secrète est CHIFFRÉE ; les codes de secours sont stockés
-- sous forme d'empreintes (jamais en clair) ; « dernier_pas » empêche de réutiliser un code déjà utilisé (rejeu).
ALTER TABLE "administrateur" ADD COLUMN "totp_secret" TEXT;
ALTER TABLE "administrateur" ADD COLUMN "totp_actif_le" TIMESTAMP(3);
ALTER TABLE "administrateur" ADD COLUMN "totp_dernier_pas" INTEGER;
ALTER TABLE "administrateur" ADD COLUMN "codes_secours" JSONB NOT NULL DEFAULT '[]';
