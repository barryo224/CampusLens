-- Seuil de pauvreté de l'Insee (60 % du niveau de vie médian, personne seule) : source surveillée par un robot et valeur de
-- départ affichée sur « Évaluer ma situation ». Ajout idempotent : rien n'est écrasé si la ligne existe déjà, et la valeur
-- reste « à vérifier » (verifie_le vide) tant qu'un administrateur ne l'a pas comparée à la page de l'Insee.
INSERT INTO "source" ("cle", "nom", "organisme", "url", "type", "frequence_heures", "statut")
SELECT 'seuil_pauvrete', 'Seuil de pauvreté (Insee)', 'Insee', 'https://www.insee.fr/fr/statistiques/5759045',
       CAST('page_web' AS "TypeSource"), 168, CAST('a_verifier' AS "StatutSource")
WHERE NOT EXISTS (SELECT 1 FROM "source" WHERE "cle" = 'seuil_pauvrete');

INSERT INTO "parametre" ("cle", "niveau", "profil_id", "annee_id", "valeur", "unite", "source_id", "verifie_le")
SELECT 'seuil_pauvrete', CAST('aucun' AS "NiveauEtudes"), NULL, a."id", 1337, '€ / mois', s."id", NULL
FROM "annee_universitaire" a, "source" s
WHERE a."en_cours" = true AND s."cle" = 'seuil_pauvrete'
  AND NOT EXISTS (SELECT 1 FROM "parametre" p WHERE p."cle" = 'seuil_pauvrete' AND p."annee_id" = a."id");
