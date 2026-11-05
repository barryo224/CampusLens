-- Verrouillage par compte : après trop d'échecs de connexion consécutifs, le compte est verrouillé quelques minutes,
-- quelle que soit l'adresse IP de l'attaquant (protège contre une force brute répartie sur de nombreuses IP).
ALTER TABLE "administrateur" ADD COLUMN "echecs_consecutifs" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "administrateur" ADD COLUMN "verrouille_jusqua" TIMESTAMP(3);
