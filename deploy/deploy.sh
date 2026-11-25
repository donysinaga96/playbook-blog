#!/usr/bin/env bash
# =====================================================================
# deploy.sh  -  Pasang satu versi (tag = commit SHA) di VPS (usulan M5-B).
# Terpasang sebagai /srv/blog/bin/deploy.
#
#   deploy <commit-sha>   pull image -> backup -> migrate -> app baru -> cek
#                         health; gagal = otomatis kembali ke versi sebelumnya
#   deploy rollback       kembali ke versi sebelumnya (tanpa membalik migration)
#   deploy status         versi terpasang + status container
#
# Image harus sudah bisa ditarik (job CI `deploy` login ke registry dulu lewat
# deploy-ssh). Berkas compose, Caddyfile, dan skrip bin/ diperbarui dari image
# tools versi itu, jadi konfigurasi VPS selalu sama dengan commit-nya.
# Migration bersifat maju saja (append-only): rollback memakai aplikasi lama
# di atas schema baru, jadi migration harus tetap kompatibel dengan versi
# sebelumnya (tambah kolom/tabel, jangan hapus di rilis yang sama).
# =====================================================================
set -euo pipefail

ROOT=${BLOG_ROOT:-/srv/blog}
cd "$ROOT"
set -a
# shellcheck disable=SC1091
. ./.env
set +a

current=$(cat current-tag 2>/dev/null || true)
previous=$(cat previous-tag 2>/dev/null || true)

log() { printf '%s  %s\n' "$(date -u +%H:%M:%S)" "$*"; }

# APP_TAG menentukan versi image di compose.yml; diekspor sebelum dipanggil.
wait_healthy() {
  local cid status
  for _ in $(seq 1 60); do
    cid=$(docker compose ps -q app)
    status=$(docker inspect --format '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo starting)
    [ "$status" = healthy ] && return 0
    [ "$status" = unhealthy ] && return 1
    sleep 2
  done
  return 1
}

start_app() {
  export APP_TAG=$1
  docker compose up -d --remove-orphans app caddy
}

case "${1:-}" in
  status)
    echo "terpasang : ${current:-belum ada}"
    echo "sebelumnya: ${previous:-belum ada}"
    APP_TAG=${current:-none} docker compose ps
    exit 0
    ;;
  rollback)
    [ -n "$previous" ] || { echo "tidak ada versi sebelumnya" >&2; exit 1; }
    log "rollback ke $previous"
    start_app "$previous"
    wait_healthy || { echo "versi $previous juga tidak sehat; periksa: docker compose logs app" >&2; exit 1; }
    echo "$previous" > current-tag
    echo "$current" > previous-tag
    log "rollback selesai: $previous"
    exit 0
    ;;
esac

tag=${1:-}
[[ "$tag" =~ ^[0-9a-f]{40}$ ]] || { echo "pemakaian: deploy <commit-sha 40 karakter> | rollback | status" >&2; exit 1; }
[ "$tag" = "$current" ] && log "versi $tag sudah terpasang; dipasang ulang"
export APP_TAG=$tag

log "1/6 pull image $tag"
docker compose --profile tools pull app tools

log "2/6 perbarui compose, Caddyfile, dan skrip dari image"
tmp=$(mktemp -d)
cid=$(docker create "$REGISTRY_IMAGE/tools:$tag")
docker cp "$cid:/repo/deploy/." "$tmp/"
docker rm "$cid" > /dev/null
caddy_changed=0
cmp -s "$tmp/Caddyfile" Caddyfile || caddy_changed=1
# Salinan konfigurasi versi terpasang: dikembalikan bila versi baru gagal.
[ -f compose.yml ] && cp -p compose.yml compose.yml.prev
[ -f Caddyfile ] && cp -p Caddyfile Caddyfile.prev
install -m 0644 "$tmp/compose.prod.yml" compose.yml
install -m 0644 "$tmp/Caddyfile" Caddyfile
install -m 0755 "$tmp/deploy.sh" bin/deploy.new && mv -f bin/deploy.new bin/deploy
install -m 0755 "$tmp/deploy-ssh.sh" bin/deploy-ssh.new && mv -f bin/deploy-ssh.new bin/deploy-ssh
install -m 0755 "$tmp/bin-tools.sh" bin/tools.new && mv -f bin/tools.new bin/tools
install -m 0755 "$tmp/backup-offsite.sh" bin/backup-offsite.new && mv -f bin/backup-offsite.new bin/backup-offsite
rm -rf -- "$tmp"

log "3/6 database"
docker compose up -d db
if [ -n "$current" ]; then
  log "    backup sebelum migrate (image $current)"
  APP_TAG=$current docker compose run --rm -T tools backup
fi
docker compose run --rm -T tools migrate

log "4/6 jalankan aplikasi $tag"
start_app "$tag"
if [ "$caddy_changed" = 1 ]; then
  docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile || true
fi

log "5/6 cek health"
if ! wait_healthy; then
  log "GAGAL: versi $tag tidak sehat"
  docker compose logs --tail 50 app || true
  if [ -n "$current" ] && [ "$current" != "$tag" ]; then
    log "kembali ke $current (berikut compose.yml dan Caddyfile-nya)"
    [ -f compose.yml.prev ] && mv -f compose.yml.prev compose.yml
    [ -f Caddyfile.prev ] && mv -f Caddyfile.prev Caddyfile
    start_app "$current"
    if [ "$caddy_changed" = 1 ]; then
      docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile || true
    fi
    if wait_healthy; then log "versi $current jalan lagi"; else log "versi $current juga tidak sehat!"; fi
  fi
  exit 1
fi
if [ "$tag" != "$current" ]; then
  [ -n "$current" ] && echo "$current" > previous-tag
  echo "$tag" > current-tag
fi

log "6/6 bersihkan image lama (simpan versi terpasang dan sebelumnya)"
docker image ls --filter "reference=$REGISTRY_IMAGE/*:*" --format '{{.Repository}}:{{.Tag}}' | while read -r image; do
  case "${image##*:}" in
    "$tag"|"${current:-$tag}") ;;
    *) docker image rm "$image" > /dev/null || true ;;
  esac
done

log "deploy selesai: $tag"
