#!/bin/sh
# =====================================================================
# ci-image-check.sh  -  Uji image produksi sebelum di-push (job CI `image`).
#
#   sh deploy/ci-image-check.sh <image-app> <image-tools>
#
# Menjalankan image persis seperti di VPS (tanpa source repo, hanya image):
# PostgreSQL 18 kosong -> tools migrate + seed dev -> tools site:create ->
# app -> health, halaman site seed dan site baru, izin TLS (ask), admin.
# Menangkap berkas yang hilang dari .output atau image tools.
# =====================================================================
set -eu

APP=$1
TOOLS=$2
NET=imgcheck-$$
PW=imgcheck_owner
APW=imgcheck_app

cleanup() {
  docker rm -f "$NET-app" "$NET-db" > /dev/null 2>&1 || true
  docker network rm "$NET" > /dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create "$NET" > /dev/null
docker run -d --name "$NET-db" --network "$NET" --network-alias db \
  -e POSTGRES_USER=blog -e POSTGRES_PASSWORD=$PW -e POSTGRES_DB=postgres \
  postgres:18.7 postgres -c timezone=UTC > /dev/null
for i in $(seq 1 60); do
  docker exec "$NET-db" pg_isready -q -U blog -d postgres && break
  [ "$i" = 60 ] && { echo "FAIL  database tidak siap"; exit 1; }
  sleep 1
done

tools() {
  docker run --rm --network "$NET" \
    -e PGHOST=db -e PGUSER=blog -e PGPASSWORD=$PW -e PGDATABASE=blog \
    -e APP_DB_USER=blog_app -e APP_DB_PASSWORD=$APW -e AGENT_DB_USER=blog_agent \
    -e DATABASE_URL=postgres://blog_app:$APW@db:5432/blog \
    "$@"
}

echo "== tools: migrate, seed dev, site:create"
tools "$TOOLS" migrate
tools --entrypoint sh "$TOOLS" /repo/packages/db/scripts/seed.sh
tools "$TOOLS" site:create --code imgcheck --name "Cek Image" --template news --domain imgcheck.localhost

echo "== app"
docker run -d --name "$NET-app" --network "$NET" --network-alias app \
  -e DATABASE_URL=postgres://blog_app:$APW@db:5432/blog \
  -e SITE_MODE=multi -e ADMIN_HOST=admin.localhost \
  -e ADMIN_SESSION_SECRET=imgcheck-session-secret-bukan-produksi-0123456789 \
  -e TRUST_PROXY=true -e MEDIA_DIR=/tmp \
  "$APP" > /dev/null
for i in $(seq 1 60); do
  status=$(docker inspect --format '{{.State.Health.Status}}' "$NET-app")
  [ "$status" = healthy ] && break
  if [ "$status" = unhealthy ] || [ "$i" = 60 ]; then
    echo "FAIL  app tidak sehat ($status)"
    docker logs --tail 50 "$NET-app"
    exit 1
  fi
  sleep 2
done
echo "PASS  app healthy (healthcheck image)"

check() {
  docker run --rm --network "$NET" --entrypoint node "$TOOLS" /repo/deploy/http-check.mjs "$@"
}
check http://app:3000/ tekno.localhost 200 '<html'
check http://app:3000/ kuliner.localhost 200 '<html'
check http://app:3000/ imgcheck.localhost 200 'Cek Image'
check http://app:3000/ tidak-dikenal.localhost 404
check http://app:3000/api/internal/tls-ask?domain=tekno.localhost app:3000 200
check http://app:3000/api/internal/tls-ask?domain=admin.localhost app:3000 200
check http://app:3000/api/internal/tls-ask?domain=jahat.example app:3000 404
check http://app:3000/admin/login admin.localhost 200
echo "== image lulus"
