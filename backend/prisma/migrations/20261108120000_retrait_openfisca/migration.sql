-- Retrait de l'estimation OpenFisca : la colonne qui marquait les aides « calculables » n'est plus utilisée.
ALTER TABLE "aide" DROP COLUMN "code_openfisca";
