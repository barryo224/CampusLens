-- Verrou : au plus UNE synchronisation « en_cours » par source (SYN-11).
-- Index séparé de la migration précédente : PostgreSQL interdit d'utiliser une valeur
-- d'énumération dans la transaction qui vient de la créer.
CREATE UNIQUE INDEX "synchronisation_un_seul_en_cours_par_source"
  ON "synchronisation" ("source_id") WHERE "statut" = 'en_cours';
