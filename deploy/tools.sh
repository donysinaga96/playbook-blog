#!/bin/sh
# =====================================================================
# tools  -  Entry point image `tools` (Dockerfile, ADR-012). Di VPS dipanggil
# lewat /srv/blog/bin/tools <perintah> (docker compose run --rm tools ...).
#
#   migrate                     buat database bila belum ada, migration,
#                               role aplikasi + agent (tanpa seed dev)
#   backup                      packages/db/scripts/backup.sh
#   restore <set> <database>    packages/db/scripts/restore.sh
#   admin:create | site:create | site:domain | revenue:sync  [argumen ...]
#   size                        ukuran database dan per tabel
#   psql                        konsol psql sebagai pemilik schema
#
# Koneksi: PG* (pemilik schema) untuk perintah database, DATABASE_URL (role
# aplikasi) untuk skrip Node, keduanya diisi compose.prod.yml.
# =====================================================================
set -eu

DB_SCRIPTS=/repo/packages/db/scripts
cmd=${1:-help}
[ $# -gt 0 ] && shift

case "$cmd" in
  migrate)
    exists=$(echo "SELECT 1 FROM pg_database WHERE datname = :'db';" | psql -X -tA -d postgres -v db="$PGDATABASE")
    if [ -z "$exists" ]; then
      echo "database $PGDATABASE belum ada: dibuat"
      createdb "$PGDATABASE"
    fi
    SEED_DEV_DATA=false exec sh "$DB_SCRIPTS/setup.sh"
    ;;
  backup) exec sh "$DB_SCRIPTS/backup.sh" ;;
  restore) exec sh "$DB_SCRIPTS/restore.sh" "$@" ;;
  admin:create) cd /repo/apps/web; exec node --import tsx scripts/admin-create.ts "$@" ;;
  site:create) cd /repo/apps/web; exec node --import tsx scripts/site-create.ts "$@" ;;
  site:domain) cd /repo/apps/web; exec node --import tsx scripts/site-domain.ts "$@" ;;
  revenue:sync) cd /repo/apps/web; exec node --import tsx scripts/revenue-sync.ts "$@" ;;
  size) exec psql -X -q -f "$DB_SCRIPTS/size.sql" ;;
  psql) exec psql -X "$@" ;;
  help|-h|--help)
    sed -n '3,16p' "$0" | sed 's/^# \{0,1\}//'
    ;;
  *)
    echo "perintah tidak dikenal: $cmd (lihat: tools help)" >&2
    exit 1
    ;;
esac
