#!/bin/sh
# =====================================================================
# backup.sh  -  Backup database + media (M5 5.3, usulan M5-C).
#
# Satu set backup = nama dasar blog-<db>-<UTC>:
#   <nama>.dump          pg_dump format custom (bisa dipulihkan sebagian)
#   <nama>.media.tar.gz  isi MEDIA_SRC (file media tidak ada di database)
#   <nama>.counts        jumlah baris per tabel saat backup (dicek restore.sh)
#   <nama>.sha256        checksum ketiga file di atas
# Set terlama dihapus bila jumlahnya melebihi BACKUP_KEEP.
#
# Env: PG* (pemilik schema), BACKUP_DIR (bawaan /backups), MEDIA_SRC
# (bawaan /media; tidak ada = tanpa media), BACKUP_KEEP (bawaan 14).
# Di Docker: pnpm db:backup. Mengirim backup ke luar server (wajib di
# produksi) dikerjakan bersama deploy.
# =====================================================================
set -eu

BACKUP_DIR=${BACKUP_DIR:-/backups}
MEDIA_SRC=${MEDIA_SRC:-/media}
BACKUP_KEEP=${BACKUP_KEEP:-14}
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"

case "$BACKUP_KEEP" in
  ''|*[!0-9]*) echo "BACKUP_KEEP harus bilangan bulat positif" >&2; exit 1 ;;
esac
[ "$BACKUP_KEEP" -ge 1 ] || { echo "BACKUP_KEEP minimal 1" >&2; exit 1; }

mkdir -p "$BACKUP_DIR"
start=$(date +%s)
name="blog-${PGDATABASE}-$(date -u +%Y%m%dT%H%M%SZ)"
cd "$BACKUP_DIR"

# File sementara dulu, lalu rename: set yang gagal di tengah tidak terlihat lengkap.
pg_dump --format=custom --no-password --file="$name.dump.tmp"
psql -X -q -tA -v ON_ERROR_STOP=1 -c "
  SELECT c.relname || '=' || (xpath('/table/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM %I', c.relname), false, false, '')))[1]::text
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
   ORDER BY c.relname" > "$name.counts.tmp"

files="$name.dump $name.counts"
if [ -d "$MEDIA_SRC" ]; then
  tar -czf "$name.media.tar.gz.tmp" -C "$MEDIA_SRC" .
  mv "$name.media.tar.gz.tmp" "$name.media.tar.gz"
  files="$files $name.media.tar.gz"
else
  echo "media dilewati ($MEDIA_SRC tidak ada)"
fi
mv "$name.dump.tmp" "$name.dump"
mv "$name.counts.tmp" "$name.counts"
# shellcheck disable=SC2086
sha256sum $files > "$name.sha256"

# Retensi: set ditandai oleh file .sha256 (ditulis paling akhir).
ls -1 blog-"${PGDATABASE}"-*.sha256 2>/dev/null | sort -r | tail -n +"$((BACKUP_KEEP + 1))" | while read -r old; do
  base=${old%.sha256}
  rm -f "$base.dump" "$base.counts" "$base.media.tar.gz" "$base.sha256"
  echo "hapus  $base (retensi $BACKUP_KEEP)"
done

end=$(date +%s)
echo "backup $name selesai dalam $((end - start)) detik:"
# shellcheck disable=SC2086
ls -l $files | awk '{ printf "  %10d  %s\n", $5, $9 }'
