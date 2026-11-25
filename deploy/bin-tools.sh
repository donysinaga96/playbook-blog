#!/usr/bin/env bash
# /srv/blog/bin/tools <perintah> [argumen]  -  image tools versi terpasang.
# Contoh: bin/tools admin:create --email kamu@contoh.id --name "Nama" --superadmin
#         bin/tools site:domain --site beritakonoha --add beritakonoha.id --primary
#         bin/tools backup | bin/tools size | bin/tools help
set -euo pipefail
cd "${BLOG_ROOT:-/srv/blog}"
tag=$(cat current-tag 2>/dev/null || true)
[ -n "$tag" ] || { echo "belum ada versi terpasang (jalankan deploy dulu)" >&2; exit 1; }
tty=()
[ -t 0 ] && [ -t 1 ] || tty=(-T)
APP_TAG=$tag exec docker compose run --rm "${tty[@]}" tools "$@"
