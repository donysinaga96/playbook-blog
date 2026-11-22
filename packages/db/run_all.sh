#!/usr/bin/env bash
# =====================================================================
# run_all.sh  -  Uji lengkap packages/db pada database baru:
#   1. migration (2x; run kedua harus melewati semua file)
#   2. runner menolak migration yang sudah diubah
#   3. role aplikasi
#   4. seed (2x; jumlah baris harus sama)
#   5. 61 test integritas
#   6. hak akses role aplikasi
#   7. hak akses role AI agent (ADR-010)
#   8. backup lalu restore ke database baru (M5 5.3)
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
AGENT_USER="${AGENT_DB_USER:-blog_agent}"
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

echo "== 3. Role aplikasi dan role AI agent"
APP_DB_USER="$APP_USER" APP_DB_PASSWORD="$APP_PASS" sh "$DIR/scripts/app_role.sh"
# Tanpa password: role agent yang sudah ada (mis. milik database dev) tidak
# diubah login/password-nya; pemeriksaan di bagian 7 memakai SET ROLE.
AGENT_DB_USER="$AGENT_USER" AGENT_DB_PASSWORD="" sh "$DIR/scripts/agent_role.sh"

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
      SELECT 'redirects', count(*) FROM redirects UNION ALL
      SELECT 'article_references', count(*) FROM article_references UNION ALL
      SELECT 'generated_articles', count(*) FROM generated_articles) x"
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

echo "== 7. Hak akses role AI agent ($AGENT_USER)"
# Setiap pemeriksaan berjalan sebagai agent (SET LOCAL ROLE) di transaksi
# yang di-ROLLBACK. Hasil yang sudah diputuskan disiapkan pemilik schema.
SITE_B="01930000-0000-7000-8000-000000000102"
agent_sql() {
  psql -X -tA -v ON_ERROR_STOP=1 2>&1 <<SQL
BEGIN;
INSERT INTO generated_articles (id, site_id, external_id, payload, status, review_note, reviewed_at)
VALUES ('01930000-0000-7000-8000-000000009902', '$SITE_B', 'uji-agent-diputuskan', '{}', 'ARCHIVED', 'uji', now());
SET LOCAL ROLE "$AGENT_USER";
$1;
ROLLBACK;
SQL
}
agent_ok() {
  local out
  out="$(agent_sql "$2")" || fail "$1 -> $out"
  pass "$1"
}
agent_denied() {
  local out
  if out="$(agent_sql "$2")"; then fail "$1 -> berhasil, padahal harus ditolak"; fi
  grep -q "$3" <<<"$out" || fail "$1 -> galat lain: $out"
  pass "$1"
}
agent_ok "agent membaca kode site, kategori, penulis, tag" \
  "SELECT s.code, c.slug, a.slug, t.slug FROM sites s JOIN categories c ON c.site_id = s.id
     LEFT JOIN authors a ON a.site_id = s.id LEFT JOIN tags t ON t.site_id = s.id LIMIT 1"
agent_ok "agent menulis hasil AI lalu memperbaruinya lewat external_id (status otomatis READY_TO_PUBLISH)" \
  "INSERT INTO generated_articles (site_id, external_id, payload, agent_note) VALUES ('$SITE_B', 'uji-agent', '{\"version\": 1}', 'catatan');
   INSERT INTO generated_articles (site_id, external_id, payload) VALUES ('$SITE_B', 'uji-agent', '{\"version\": 1, \"title\": \"baru\"}')
     ON CONFLICT (site_id, external_id) DO UPDATE SET payload = EXCLUDED.payload, generated_at = now()
     WHERE generated_articles.status = 'READY_TO_PUBLISH';
   DO \$\$ BEGIN IF (SELECT status <> 'READY_TO_PUBLISH' OR payload->>'title' <> 'baru' FROM generated_articles
     WHERE external_id = 'uji-agent') THEN RAISE EXCEPTION 'hasil upsert salah'; END IF; END \$\$"
agent_denied "agent tidak bisa mengisi status saat INSERT" \
  "INSERT INTO generated_articles (site_id, external_id, payload, status) VALUES ('$SITE_B', 'x', '{}', 'APPROVED')" "permission denied"
agent_denied "agent tidak bisa mengubah status" \
  "UPDATE generated_articles SET status = 'APPROVED'" "permission denied"
agent_denied "agent tidak bisa mengisi keputusan (review_note)" \
  "UPDATE generated_articles SET review_note = 'x'" "permission denied"
agent_denied "agent tidak bisa mengubah isi hasil yang sudah diputuskan" \
  "UPDATE generated_articles SET payload = '{\"diubah\": true}' WHERE external_id = 'uji-agent-diputuskan'" "sudah diputuskan"
agent_denied "agent tidak bisa menghapus hasil AI" \
  "DELETE FROM generated_articles" "permission denied"
agent_denied "agent tidak bisa menulis articles" \
  "INSERT INTO articles (site_id, category_id, title, slug) VALUES ('$SITE_B', '01930000-0000-7000-8000-000000000411', 'x', 'x')" "permission denied"
agent_denied "agent tidak bisa membaca articles" "SELECT 1 FROM articles" "permission denied"
agent_denied "agent tidak bisa membaca users" "SELECT 1 FROM users" "permission denied"
agent_denied "agent tidak bisa membaca sites.settings" "SELECT settings FROM sites" "permission denied"
agent_denied "agent tidak bisa menulis media" \
  "UPDATE media SET source_url = 'https://x.test'" "permission denied"

echo "== 8. Backup dan restore ($DB -> ${DB}_restore)"
BK="$(mktemp -d)"
dropdb --if-exists "${DB}_restore"
BACKUP_DIR="$BK" MEDIA_SRC="$BK/tanpa-media" BACKUP_KEEP=1 sh "$DIR/scripts/backup.sh" >/dev/null
SET="$(basename "$(ls "$BK"/*.dump)")"
if ! APP_DB_USER="$APP_USER" APP_DB_PASSWORD="$APP_PASS" AGENT_DB_USER="$AGENT_USER" BACKUP_DIR="$BK" \
     sh "$DIR/scripts/restore.sh" "$SET" "${DB}_restore" > "$BK/restore.log" 2>&1; then
  cat "$BK/restore.log"; rm -rf "$BK"; fail "restore gagal"
fi
grep -q "^PASS  .* jumlah baris sama" "$BK/restore.log" || { cat "$BK/restore.log"; fail "jumlah baris tidak dicek"; }
pass "backup dipulihkan ke database baru, jumlah baris per tabel sama"
if BACKUP_DIR="$BK" sh "$DIR/scripts/restore.sh" "$SET" "${DB}_restore" >/dev/null 2>&1; then fail "restore menimpa database yang sudah ada"; fi
pass "restore menolak database tujuan yang sudah ada"
printf 'x' >> "$BK/$SET"
if BACKUP_DIR="$BK" sh "$DIR/scripts/restore.sh" "$SET" "${DB}_restore2" >/dev/null 2>&1; then fail "restore menerima backup yang diubah"; fi
pass "restore menolak backup yang checksum-nya berbeda"
dropdb --if-exists "${DB}_restore"; dropdb --if-exists "${DB}_restore2"; rm -rf "$BK"

echo "== SELESAI: semua pemeriksaan lulus"
