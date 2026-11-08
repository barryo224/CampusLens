-- Retrait du seuil de pauvreté (Insee), ajouté par la migration 20261108130000 : ce n'est pas un seuil propre aux étudiants
-- et la page ne l'affiche plus. On retire la source, sa valeur, et tout ce qui en dépend (passages du robot, alertes,
-- historique). Idempotent : sans cette source, il ne se passe rien.
DELETE FROM "historique_valeur"
WHERE "synchronisation_id" IN (
        SELECT "id" FROM "synchronisation"
        WHERE "source_id" IN (SELECT "id" FROM "source" WHERE "cle" = 'seuil_pauvrete'))
   OR ("table_cible" = 'parametre'
       AND "ligne_id" IN (SELECT CAST("id" AS TEXT) FROM "parametre" WHERE "cle" = 'seuil_pauvrete'));

DELETE FROM "changement_detecte"
WHERE "source_id" IN (SELECT "id" FROM "source" WHERE "cle" = 'seuil_pauvrete');

DELETE FROM "synchronisation"
WHERE "source_id" IN (SELECT "id" FROM "source" WHERE "cle" = 'seuil_pauvrete');

DELETE FROM "parametre" WHERE "cle" = 'seuil_pauvrete';

DELETE FROM "source" WHERE "cle" = 'seuil_pauvrete';
