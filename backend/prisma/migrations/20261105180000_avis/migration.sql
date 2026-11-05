-- Avis des visiteurs sur le site (note de 1 à 5 + commentaire facultatif). Anonymes : ni nom, ni e-mail, ni adresse IP.
-- Supprimés automatiquement à `supprimer_apres` (RGPD).
CREATE TABLE "avis" (
    "id" SERIAL NOT NULL,
    "note" INTEGER NOT NULL,
    "commentaire" TEXT,
    "page" TEXT,
    "profil" TEXT,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supprimer_apres" TIMESTAMP(3) NOT NULL,
    "lu_le" TIMESTAMP(3),

    CONSTRAINT "avis_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "avis_note_entre_1_et_5" CHECK ("note" BETWEEN 1 AND 5)
);

CREATE INDEX "avis_supprimer_apres_idx" ON "avis"("supprimer_apres");
