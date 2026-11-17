#!/bin/sh
# app_role.sh  -  Membuat/memperbarui role aplikasi (lihat app_role.sql).
# Butuh APP_DB_USER dan APP_DB_PASSWORD. Dilewati bila APP_DB_USER kosong.
set -eu

DIR=$(cd "$(dirname "$0")" && pwd)
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"

if [ -z "${APP_DB_USER:-}" ]; then
  echo "app_role dilewati (APP_DB_USER kosong)"
  exit 0
fi
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD wajib diisi bila APP_DB_USER diisi}"

psql -X -q -v ON_ERROR_STOP=1 \
     -v app_user="$APP_DB_USER" -v app_password="$APP_DB_PASSWORD" \
     -f "$DIR/app_role.sql"
echo "app_role $APP_DB_USER siap"
