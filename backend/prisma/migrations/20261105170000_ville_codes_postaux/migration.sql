-- Codes postaux des villes suivies : la recherche du comparateur trouve une ville par son code postal.
ALTER TABLE "ville" ADD COLUMN "codes_postaux" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
