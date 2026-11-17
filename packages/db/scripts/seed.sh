#!/bin/sh
# seed.sh  -  Mengisi data contoh development. Semua file seed idempotent,
# jadi aman dijalankan berulang. JANGAN dijalankan di produksi.
set -eu

DIR=$(cd "$(dirname "$0")/.." && pwd)
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"

for f in "$DIR"/seed/*.sql; do
  [ -e "$f" ] || { echo "tidak ada file seed"; exit 0; }
  echo "seed   $(basename "$f")"
  psql -X -q -v ON_ERROR_STOP=1 -f "$f"
done
