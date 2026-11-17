#!/bin/sh
# =====================================================================
# migrate.sh  -  Menjalankan migration SQL yang belum pernah dijalankan.
#
# - File di migrations/ dijalankan berurutan nama (0001_, 0002_, ...).
# - Setiap file + catatannya di schema_migrations berjalan dalam SATU
#   transaksi: gagal di tengah = tidak ada yang tersimpan.
# - Checksum disimpan. File yang sudah dijalankan lalu diubah isinya
#   ditolak, karena migration bersifat append-only: buat file baru.
# - Koneksi lewat variabel standar libpq:
#   PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE.
# - POSIX sh: jalan di image postgres (Debian/Alpine) maupun di host.
# =====================================================================
set -eu

DIR=$(cd "$(dirname "$0")/.." && pwd)
MIGRATIONS_DIR=${MIGRATIONS_DIR:-$DIR/migrations}
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"

psql_run() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }

psql_run <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename    text        PRIMARY KEY,
  checksum    text        NOT NULL,
  applied_at  timestamptz NOT NULL DEFAULT now()
);
SQL

applied=0
skipped=0
found=0

for f in "$MIGRATIONS_DIR"/*.sql; do
  [ -e "$f" ] || break
  found=$((found + 1))
  name=$(basename "$f")

  case "$name" in
    [0-9][0-9][0-9][0-9]_*.sql) ;;
    *) echo "ERROR  $name: nama harus NNNN_deskripsi.sql" >&2; exit 1 ;;
  esac
  case "$name" in
    *[!A-Za-z0-9_.-]*) echo "ERROR  $name: hanya huruf, angka, _ . -" >&2; exit 1 ;;
  esac

  if grep -Eiq '^[[:space:]]*(BEGIN|COMMIT|ROLLBACK|START[[:space:]]+TRANSACTION)[[:space:]]*;' "$f"; then
    echo "ERROR  $name: jangan tulis BEGIN/COMMIT; runner sudah membungkus transaksi" >&2
    exit 1
  fi

  sum=$(sha256sum "$f" | cut -d' ' -f1)
  stored=$(echo "SELECT checksum FROM schema_migrations WHERE filename = :'name';" \
             | psql_run -tA -v name="$name")

  if [ -n "$stored" ]; then
    if [ "$stored" != "$sum" ]; then
      echo "ERROR  $name sudah pernah dijalankan, tetapi isinya berubah." >&2
      echo "       Kembalikan file itu, lalu tulis perubahan di migration baru." >&2
      exit 1
    fi
    echo "skip   $name"
    skipped=$((skipped + 1))
    continue
  fi

  echo "apply  $name"
  {
    echo "BEGIN;"
    cat "$f"
    echo ""
    echo "INSERT INTO schema_migrations (filename, checksum) VALUES (:'name', :'sum');"
    echo "COMMIT;"
  } | psql_run -v name="$name" -v sum="$sum"
  applied=$((applied + 1))
done

if [ "$found" -eq 0 ]; then
  echo "ERROR  tidak ada file .sql di $MIGRATIONS_DIR" >&2
  exit 1
fi
echo "migrate selesai: $applied dijalankan, $skipped dilewati"
