#!/usr/bin/env bash
# Sauvegarde de la base de production (données publiques + structure), sans les données personnelles.
#   DATABASE_URL='postgresql://…' npm run sauvegarder
#   (dossier de sortie : SAUVEGARDE_DIR, par défaut ~/Sauvegardes-CampusLens)
#
# Ne sont PAS sauvegardées (leur structure l'est, pas leur contenu) : les messages de contact, les avis, les comptes
# d'administration, les sessions et l'historique des validations (il pointe vers un compte administrateur). Ce sont des données personnelles ou secrètes ; un compte se recrée avec
# `npm run admin:creer -w backend`. Le fichier produit peut ainsi être gardé sans risque pour la vie privée.
# Restaurer dans une base VIDE : gzip -dc fichier.sql.gz | psql "$ADRESSE_BASE_VIDE"
set -euo pipefail
: "${DATABASE_URL:?Définir DATABASE_URL (adresse de la base à sauvegarder).}"
DOSSIER="${SAUVEGARDE_DIR:-$HOME/Sauvegardes-CampusLens}"
mkdir -p "$DOSSIER"
FICHIER="$DOSSIER/campuslens-$(date +%Y-%m-%d_%Hh%M).sql.gz"
# L'adresse (avec son mot de passe) est passée par l'environnement, jamais écrite dans un fichier.
pg_dump "$DATABASE_URL" --no-owner --no-privileges \
  --exclude-table-data=message_contact \
  --exclude-table-data=avis \
  --exclude-table-data=administrateur \
  --exclude-table-data=session_admin \
  --exclude-table-data=changement_detecte \
  | gzip -9 > "$FICHIER"
chmod 600 "$FICHIER"
echo "Sauvegarde écrite : $FICHIER ($(du -h "$FICHIER" | cut -f1))"
# On garde les 12 plus récentes.
ls -1t "$DOSSIER"/campuslens-*.sql.gz | tail -n +13 | while read -r ancien; do rm -f "$ancien"; done
