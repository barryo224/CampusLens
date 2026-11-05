-- Messages de contact : date de lecture (vide = non lu), pour la pastille « non lus » de l'administration.
-- NB : on n'utilise pas la proposition automatique de Prisma, qui supprimerait nos index créés à la main.
ALTER TABLE "message_contact" ADD COLUMN "lu_le" TIMESTAMP(3);
