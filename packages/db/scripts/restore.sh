#!/bin/sh
# =====================================================================
# restore.sh  -  Pulihkan satu set backup ke database BARU lalu periksa
# (M5 5.3, usulan M5-C).
#
#   restore.sh <nama-set atau file .dump> <database-tujuan>
#
# 1. Checksum set dicek (.sha256).
# 2. Database tujuan harus belum ada (tidak pernah menimpa database yang
#    sedang dipakai); dibuat baru, lalu pg_restore tanpa owner dan hak.
# 3. Role aplikasi dan role agent dipasang ulang (app_role.sh,
#    agent_role.sh) bila env-nya ada, seperti setelah migration.
# 4. Jumlah baris per tabel dibandingkan dengan .counts saat backup.
# 5. Media diekstrak ke MEDIA_RESTORE (bawaan /media-restore, harus kosong)
#    dan jumlah file dibandingkan dengan isi arsip.
# Gagal di langkah mana pun = exit bukan 0. Database tujuan tidak dihapus,
# agar bisa diperiksa; hapus sendiri dengan dropdb.
#
# Env: PG* (pemilik schema), BACKUP_DIR (bawaan /backups), MEDIA_RESTORE.
# Di Docker: pnpm db:restore <nama-set> <database-tujuan>
# =====================================================================
set -eu

DIR=$(cd "$(dirname "$0")" && pwd)
BACKUP_DIR=${BACKUP_DIR:-/backups}
MEDIA_RESTORE=${MEDIA_RESTORE:-/media-restore}
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"

[ $# -eq 2 ] || { echo "pemakaian: restore.sh <nama-set atau file .dump> <database-tujuan>" >&2; exit 1; }
name=$(basename "$1" .dump)
target=$2
case "$target" in
  *[!a-z0-9_]*|'') echo "nama database tujuan: huruf kecil, angka, _" >&2; exit 1 ;;
esac

cd "$BACKUP_DIR"
[ -f "$name.sha256" ] || { echo "set $name tidak ditemukan di $BACKUP_DIR" >&2; exit 1; }
start=$(date +%s)

echo "== 1. Checksum"
sha256sum -c "$name.sha256"

echo "== 2. Pulihkan ke database baru $target"
# psql -c tidak mengganti variabel :'target'; lewat stdin, nilainya di-quote psql.
exists=$(echo "SELECT 1 FROM pg_database WHERE datname = :'target';" | psql -X -tA -d postgres -v target="$target")
[ -z "$exists" ] || { echo "database $target sudah ada; restore hanya ke database baru" >&2; exit 1; }
createdb "$target"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$target" "$name.dump"

echo "== 3. Role aplikasi dan agent"
PGDATABASE=$target sh "$DIR/app_role.sh"
PGDATABASE=$target sh "$DIR/agent_role.sh"

echo "== 4. Jumlah baris per tabel"
PGDATABASE=$target psql -X -q -tA -v ON_ERROR_STOP=1 -c "
  SELECT c.relname || '=' || (xpath('/table/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM %I', c.relname), false, false, '')))[1]::text
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
   ORDER BY c.relname" > /tmp/restore.counts
if ! diff "$name.counts" /tmp/restore.counts; then
  echo "FAIL  jumlah baris berbeda (kiri: saat backup, kanan: hasil restore)" >&2
  exit 1
fi
echo "PASS  $(wc -l < /tmp/restore.counts) tabel, jumlah baris sama"

echo "== 5. Media"
if [ -f "$name.media.tar.gz" ]; then
  mkdir -p "$MEDIA_RESTORE"
  [ -z "$(ls -A "$MEDIA_RESTORE")" ] || { echo "$MEDIA_RESTORE tidak kosong" >&2; exit 1; }
  tar -xzf "$name.media.tar.gz" -C "$MEDIA_RESTORE"
  archived=$(tar -tzf "$name.media.tar.gz" | grep -vc '/$' || true)
  restored=$(find "$MEDIA_RESTORE" -type f | wc -l)
  [ "$archived" -eq "$restored" ] || { echo "FAIL  file media: arsip $archived, hasil $restored" >&2; exit 1; }
  echo "PASS  $restored file media"
else
  echo "set ini tanpa media"
fi

end=$(date +%s)
echo "== SELESAI: $name dipulihkan ke $target dalam $((end - start)) detik"
