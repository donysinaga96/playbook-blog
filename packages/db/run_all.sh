#!/usr/bin/env bash
# =====================================================================
# run_all.sh  -  Uji lengkap packages/db pada database baru:
#   1. migration (2x; run kedua harus melewati semua file)
#   2. runner menolak migration yang sudah diubah
#   3. role aplikasi
#   4. seed (2x; jumlah baris harus sama)
#   5. 42 test integritas
#   6. hak akses role aplikasi
#
# Pemakaian:  APP_DB_PASSWORD=... ./run_all.sh [nama_db]
# Koneksi lewat PGHOST, PGPORT, PGUSER, PGPASSWORD (pemilik schema).
# Di Docker: docker compose --profile test run --rm db-test
#
# APP_DB_PASSWORD wajib dan tidak punya default: role PostgreSQL berlaku
# untuk seluruh server, jadi password yang dipasang di sini juga menjadi
# password blog_app milik database dev. Pakai nilai yang sama dengan .env.
# =====================================================================
set -euo pipefail

DB="${1:-blog_framework_test}"
DIR="$(cd "$(dirname "$0")" && pwd)"
APP_USER="${APP_DB_USER:-blog_app}"
APP_PASS="${APP_DB_PASSWORD:?APP_DB_PASSWORD wajib diisi (samakan dengan .env); tidak ada default agar password blog_app di database dev tidak tertimpa}"
export PGOPTIONS="-c client_min_messages=warning"

pass() { echo "PASS  $*"; }
fail() { echo "FAIL  $*"; exit 1; }

dropdb --if-exists "$DB"
createdb "$DB"
export PGDATABASE="$DB"
echo "== PostgreSQL $(psql -X -tA -c 'show server_version') / database $DB"

echo "== 1. Migration"
sh "$DIR/scripts/migrate.sh"
OUT="$(sh "$DIR/scripts/migrate.sh")"
echo "$OUT"
if grep -q '^apply' <<<"$OUT"; then fail "runner menjalankan ulang migration"; fi
pass "runner idempotent"

echo "== 2. Migration yang diubah"
TMP="$(mktemp -d)"
cp "$DIR"/migrations/*.sql "$TMP"/
echo "-- perubahan diam-diam" >> "$TMP/$(ls "$DIR/migrations" | head -n1)"
if MIGRATIONS_DIR="$TMP" sh "$DIR/scripts/migrate.sh" >/dev/null 2>&1; then
  rm -rf "$TMP"; fail "runner menerima migration yang sudah diubah"
fi
rm -rf "$TMP"
pass "runner menolak migration yang sudah diubah"

echo "== 3. Role aplikasi"
APP_DB_USER="$APP_USER" APP_DB_PASSWORD="$APP_PASS" sh "$DIR/scripts/app_role.sh"

count_rows() {
  psql -X -tA -c "
    SELECT string_agg(t || '=' || n, ' ' ORDER BY t) FROM (
      SELECT 'sites' t, count(*) n FROM sites UNION ALL
      SELECT 'site_domains', count(*) FROM site_domains UNION ALL
      SELECT 'site_themes', count(*) FROM site_themes UNION ALL
      SELECT 'site_members', count(*) FROM site_members UNION ALL
      SELECT 'users', count(*) FROM users UNION ALL
      SELECT 'media', count(*) FROM media UNION ALL
      SELECT 'authors', count(*) FROM authors UNION ALL
      SELECT 'categories', count(*) FROM categories UNION ALL
      SELECT 'tags', count(*) FROM tags UNION ALL
      SELECT 'articles', count(*) FROM articles UNION ALL
      SELECT 'article_tags', count(*) FROM article_tags UNION ALL
      SELECT 'article_revisions', count(*) FROM article_revisions UNION ALL
      SELECT 'pages', count(*) FROM pages UNION ALL
      SELECT 'menus', count(*) FROM menus UNION ALL
      SELECT 'menu_items', count(*) FROM menu_items UNION ALL
      SELECT 'redirects', count(*) FROM redirects) x"
}

echo "== 4. Seed"
sh "$DIR/scripts/seed.sh"
FIRST="$(count_rows)"
sh "$DIR/scripts/seed.sh" >/dev/null
SECOND="$(count_rows)"
echo "   $FIRST"
[[ "$FIRST" == "$SECOND" ]] || fail "seed tidak idempotent (run 2: $SECOND)"
pass "seed idempotent"

echo "== 5. Integrity tests"
psql -X -f "$DIR/tests/integrity_test.sql" 2>&1 | sed -e 's/^psql:[^:]*:[0-9]*: NOTICE:  //'

echo "== 6. Hak akses role aplikasi ($APP_USER)"
app_psql() { PGUSER="$APP_USER" PGPASSWORD="$APP_PASS" psql -X -tA -v ON_ERROR_STOP=1 "$@"; }
n="$(app_psql -c "SELECT count(*) FROM articles WHERE status = 'PUBLISHED'")"
[[ "$n" -ge 1 ]] || fail "role aplikasi tidak bisa membaca articles"
pass "role aplikasi bisa membaca data ($n artikel PUBLISHED)"
app_psql -c "BEGIN; UPDATE articles SET title = title WHERE false; INSERT INTO tags (site_id, name, slug)
             VALUES ('01930000-0000-7000-8000-000000000101', 'uji', 'uji-hak-akses'); ROLLBACK;" >/dev/null \
  || fail "role aplikasi tidak bisa INSERT/UPDATE"
pass "role aplikasi bisa INSERT/UPDATE"
if app_psql -c "CREATE TABLE uji_ddl (id int)" >/dev/null 2>&1; then fail "role aplikasi bisa membuat tabel"; fi
pass "role aplikasi tidak bisa membuat tabel"
if app_psql -c "DROP TABLE redirects" >/dev/null 2>&1; then fail "role aplikasi bisa menghapus tabel"; fi
pass "role aplikasi tidak bisa menghapus tabel"
if app_psql -c "SELECT 1 FROM schema_migrations" >/dev/null 2>&1; then fail "role aplikasi bisa membaca schema_migrations"; fi
pass "role aplikasi tidak bisa membaca schema_migrations"

echo "== SELESAI: semua pemeriksaan lulus"
