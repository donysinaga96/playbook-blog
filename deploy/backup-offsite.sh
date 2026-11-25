#!/usr/bin/env bash
# =====================================================================
# backup-offsite.sh  -  Backup harian ke Cloudflare R2 (usulan M5-C).
# Dijalankan systemd timer blog-backup.timer (03:00 WIB); bisa juga manual:
#   /srv/blog/bin/backup-offsite
#
# 1. bin/tools backup  -> /srv/blog/backups (retensi lokal BACKUP_KEEP set)
# 2. rclone copy ke r2:<R2_BUCKET>/backups (file yang sudah ada dilewati)
# 3. hapus objek di R2 yang lebih tua dari R2_KEEP_DAYS (bawaan 30)
# 4. tulis backups/offsite-status (waktu + hasil) untuk dipantau
# =====================================================================
set -euo pipefail
cd "${BLOG_ROOT:-/srv/blog}"
set -a
# shellcheck disable=SC1091
. ./.env
set +a

status() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" > backups/offsite-status; }
trap 'status GAGAL' ERR

: "${R2_ACCESS_KEY_ID:?isi R2_ACCESS_KEY_ID di /srv/blog/.env}"
: "${R2_SECRET_ACCESS_KEY:?isi R2_SECRET_ACCESS_KEY di /srv/blog/.env}"
: "${R2_ENDPOINT:?isi R2_ENDPOINT di /srv/blog/.env}"
: "${R2_BUCKET:?isi R2_BUCKET di /srv/blog/.env}"

export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY
export RCLONE_CONFIG_R2_ENDPOINT=$R2_ENDPOINT
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true

./bin/tools backup
rclone copy backups "r2:$R2_BUCKET/backups" --exclude offsite-status --immutable --stats-one-line -v
rclone delete "r2:$R2_BUCKET/backups" --min-age "${R2_KEEP_DAYS:-30}d" -v
status OK
echo "backup offsite selesai"
