-- =====================================================================
-- integrity_test.sql  -  Uji integritas schema v1 (jalankan setelah seed)
-- Seluruh file berjalan di dalam satu transaksi lalu ROLLBACK, jadi data
-- seed tidak berubah. Gagal satu test = psql berhenti (ON_ERROR_STOP).
--   Site A = kabar-tekno     01930000-0000-7000-8000-000000000101
--   Site B = dapur-nusantara 01930000-0000-7000-8000-000000000102
-- =====================================================================

\set ON_ERROR_STOP on
\set QUIET on
SET client_min_messages = notice;
\o /dev/null

BEGIN;

-- Helper: jalankan SQL, harus gagal dengan SQLSTATE tertentu.
CREATE FUNCTION pg_temp.expect_error(label text, expected_state text, stmt text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = expected_state THEN
      RAISE NOTICE 'PASS  %', label;
      RETURN;
    END IF;
    RAISE EXCEPTION 'FAIL  % -> expected SQLSTATE %, got % (%)', label, expected_state, SQLSTATE, SQLERRM;
  END;
  RAISE EXCEPTION 'FAIL  % -> statement succeeded, expected SQLSTATE %', label, expected_state;
END
$$;

-- Helper: kondisi harus benar.
CREATE FUNCTION pg_temp.expect_true(label text, cond boolean) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS TRUE THEN
    RAISE NOTICE 'PASS  %', label;
  ELSE
    RAISE EXCEPTION 'FAIL  % -> condition is %', label, cond;
  END IF;
END
$$;

-- Helper: rencana query harus memakai index tertentu.
CREATE FUNCTION pg_temp.expect_index(label text, index_name text, stmt text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  line text;
  plan text := '';
BEGIN
  FOR line IN EXECUTE 'EXPLAIN ' || stmt LOOP
    plan := plan || line || E'\n';
  END LOOP;
  IF position(index_name IN plan) > 0 THEN
    RAISE NOTICE 'PASS  %', label;
  ELSE
    RAISE EXCEPTION 'FAIL  % -> % not used. Plan:%', label, index_name, E'\n' || plan;
  END IF;
END
$$;

\echo '--- 1. Relasi lintas site ditolak database (composite FK) ---'
SELECT pg_temp.expect_error('artikel site B memakai kategori site A', '23503', $q$
  INSERT INTO articles (site_id, category_id, title, slug)
  VALUES ('01930000-0000-7000-8000-000000000102', '01930000-0000-7000-8000-000000000401', 'x', 'x-1') $q$);
SELECT pg_temp.expect_error('artikel site A memakai author site B', '23503', $q$
  INSERT INTO articles (site_id, category_id, author_id, title, slug)
  VALUES ('01930000-0000-7000-8000-000000000101', '01930000-0000-7000-8000-000000000401',
          '01930000-0000-7000-8000-000000000311', 'x', 'x-2') $q$);
SELECT pg_temp.expect_error('artikel site A memakai featured media site B', '23503', $q$
  INSERT INTO articles (site_id, category_id, featured_media_id, title, slug)
  VALUES ('01930000-0000-7000-8000-000000000101', '01930000-0000-7000-8000-000000000401',
          '01930000-0000-7000-8000-000000000212', 'x', 'x-3') $q$);
SELECT pg_temp.expect_error('tag site B dipasang ke artikel site A', '23503', $q$
  INSERT INTO article_tags (site_id, article_id, tag_id)
  VALUES ('01930000-0000-7000-8000-000000000101', '01930000-0000-7000-8000-000000000601',
          '01930000-0000-7000-8000-000000000511') $q$);
SELECT pg_temp.expect_error('parent kategori dari site lain', '23503', $q$
  INSERT INTO categories (site_id, parent_id, name, slug)
  VALUES ('01930000-0000-7000-8000-000000000102', '01930000-0000-7000-8000-000000000401', 'x', 'x') $q$);
SELECT pg_temp.expect_error('menu item site A menunjuk halaman site B', '23503', $q$
  INSERT INTO menu_items (site_id, menu_id, label, item_type, page_id)
  VALUES ('01930000-0000-7000-8000-000000000101', '01930000-0000-7000-8000-000000000801', 'x', 'PAGE',
          '01930000-0000-7000-8000-000000000712') $q$);
SELECT pg_temp.expect_error('parent menu item dari menu lain', '23503', $q$
  INSERT INTO menu_items (site_id, menu_id, parent_id, label, item_type, url)
  VALUES ('01930000-0000-7000-8000-000000000101', '01930000-0000-7000-8000-000000000802',
          '01930000-0000-7000-8000-000000000902', 'x', 'ROUTE', '/x') $q$);
SELECT pg_temp.expect_error('menu item: site_id tidak cocok dengan menu', '23503', $q$
  INSERT INTO menu_items (site_id, menu_id, label, item_type, url)
  VALUES ('01930000-0000-7000-8000-000000000101', '01930000-0000-7000-8000-000000000811', 'x', 'ROUTE', '/x') $q$);
SELECT pg_temp.expect_error('author ditautkan ke user yang bukan anggota site', '23503', $q$
  INSERT INTO authors (site_id, user_id, name, slug)
  VALUES ('01930000-0000-7000-8000-000000000102', '01930000-0000-7000-8000-000000000002', 'x', 'x') $q$);
SELECT pg_temp.expect_error('logo site memakai media site lain', '23503', $q$
  UPDATE sites SET logo_media_id = '01930000-0000-7000-8000-000000000212'
   WHERE id = '01930000-0000-7000-8000-000000000101' $q$);

\echo '--- 2. Keunikan dan format ---'
SELECT pg_temp.expect_error('domain duplikat', '23505', $q$
  INSERT INTO site_domains (site_id, domain) VALUES ('01930000-0000-7000-8000-000000000102', 'tekno.localhost') $q$);
SELECT pg_temp.expect_error('domain huruf besar', '23514', $q$
  INSERT INTO site_domains (site_id, domain) VALUES ('01930000-0000-7000-8000-000000000102', 'Tekno.LocalHost') $q$);
SELECT pg_temp.expect_error('domain dengan protokol', '23514', $q$
  INSERT INTO site_domains (site_id, domain) VALUES ('01930000-0000-7000-8000-000000000102', 'https://x.local.test') $q$);
SELECT pg_temp.expect_error('domain dengan port', '23514', $q$
  INSERT INTO site_domains (site_id, domain) VALUES ('01930000-0000-7000-8000-000000000102', 'x.local.test:3000') $q$);
SELECT pg_temp.expect_error('dua domain primary dalam satu site', '23505', $q$
  INSERT INTO site_domains (site_id, domain, is_primary) VALUES ('01930000-0000-7000-8000-000000000101', 'tekno2.local.test', true) $q$);
SELECT pg_temp.expect_error('dua theme aktif dalam satu site', '23505', $q$
  UPDATE site_themes SET is_active = true WHERE id = '01930000-0000-7000-8000-000000000142' $q$);
SELECT pg_temp.expect_error('config template duplikat untuk site yang sama', '23505', $q$
  INSERT INTO site_themes (site_id, template_key, template_version) VALUES ('01930000-0000-7000-8000-000000000101', 'magazine', '1.0.0') $q$);
SELECT pg_temp.expect_error('versi template bukan semver', '23514', $q$
  INSERT INTO site_themes (site_id, template_key, template_version) VALUES ('01930000-0000-7000-8000-000000000101', 'blog', 'v1') $q$);
SELECT pg_temp.expect_error('slug artikel duplikat dalam satu site', '23505', $q$
  INSERT INTO articles (site_id, category_id, title, slug)
  VALUES ('01930000-0000-7000-8000-000000000101', '01930000-0000-7000-8000-000000000401', 'x', 'ponsel-lipat-makin-murah') $q$);
INSERT INTO articles (site_id, category_id, title, slug)
VALUES ('01930000-0000-7000-8000-000000000102', '01930000-0000-7000-8000-000000000411', 'Slug sama, site beda', 'ponsel-lipat-makin-murah');
SELECT pg_temp.expect_true('slug sama di site berbeda diterima',
  (SELECT count(*) FROM articles WHERE slug = 'ponsel-lipat-makin-murah') = 2);
SELECT pg_temp.expect_error('slug dengan spasi/huruf besar', '23514', $q$
  INSERT INTO tags (site_id, name, slug) VALUES ('01930000-0000-7000-8000-000000000101', 'x', 'Judul Besar') $q$);

\echo '--- 3. Aturan status dan isi ---'
SELECT pg_temp.expect_error('PUBLISHED tanpa published_at', '23514', $q$
  INSERT INTO articles (site_id, category_id, title, slug, status)
  VALUES ('01930000-0000-7000-8000-000000000101', '01930000-0000-7000-8000-000000000401', 'x', 'x-4', 'PUBLISHED') $q$);
SELECT pg_temp.expect_error('status tidak dikenal', '23514', $q$
  INSERT INTO articles (site_id, category_id, title, slug, status)
  VALUES ('01930000-0000-7000-8000-000000000101', '01930000-0000-7000-8000-000000000401', 'x', 'x-5', 'SCHEDULED') $q$);
SELECT pg_temp.expect_error('body tanpa array blocks', '23514', $q$
  INSERT INTO articles (site_id, category_id, title, slug, body)
  VALUES ('01930000-0000-7000-8000-000000000101', '01930000-0000-7000-8000-000000000401', 'x', 'x-6', '[{"type":"paragraph"}]') $q$);
SELECT pg_temp.expect_error('menu CATEGORY tanpa category_id', '23514', $q$
  INSERT INTO menu_items (site_id, menu_id, label, item_type)
  VALUES ('01930000-0000-7000-8000-000000000101', '01930000-0000-7000-8000-000000000801', 'x', 'CATEGORY') $q$);
SELECT pg_temp.expect_error('menu URL plus category_id sekaligus', '23514', $q$
  INSERT INTO menu_items (site_id, menu_id, label, item_type, url, category_id)
  VALUES ('01930000-0000-7000-8000-000000000101', '01930000-0000-7000-8000-000000000801', 'x', 'URL',
          'https://a.b', '01930000-0000-7000-8000-000000000401') $q$);
SELECT pg_temp.expect_error('menu URL javascript:', '23514', $q$
  INSERT INTO menu_items (site_id, menu_id, label, item_type, url)
  VALUES ('01930000-0000-7000-8000-000000000101', '01930000-0000-7000-8000-000000000801', 'x', 'URL', 'javascript:alert(1)') $q$);
SELECT pg_temp.expect_error('menu ROUTE protocol-relative //host', '23514', $q$
  INSERT INTO menu_items (site_id, menu_id, label, item_type, url)
  VALUES ('01930000-0000-7000-8000-000000000101', '01930000-0000-7000-8000-000000000801', 'x', 'ROUTE', '//evil.example') $q$);

\echo '--- 4. Perilaku ON DELETE dan trigger ---'
DELETE FROM media WHERE id = '01930000-0000-7000-8000-000000000202';
SELECT pg_temp.expect_true('hapus media: featured_media_id jadi NULL, site_id tetap',
  (SELECT featured_media_id IS NULL AND site_id = '01930000-0000-7000-8000-000000000101'
     FROM articles WHERE id = '01930000-0000-7000-8000-000000000601'));
DELETE FROM site_members WHERE user_id = '01930000-0000-7000-8000-000000000002';
SELECT pg_temp.expect_true('hapus anggota: author.user_id jadi NULL, author tetap ada',
  (SELECT user_id IS NULL FROM authors WHERE id = '01930000-0000-7000-8000-000000000302'));
SELECT pg_temp.expect_error('hapus kategori yang masih punya artikel', '23503', $q$
  DELETE FROM categories WHERE id = '01930000-0000-7000-8000-000000000402' $q$);
INSERT INTO categories (id, site_id, name, slug)
VALUES ('01930000-0000-7000-8000-00000000c001', '01930000-0000-7000-8000-000000000101', 'Sementara', 'sementara');
INSERT INTO menu_items (site_id, menu_id, label, item_type, category_id)
VALUES ('01930000-0000-7000-8000-000000000101', '01930000-0000-7000-8000-000000000801', 'Sementara', 'CATEGORY',
        '01930000-0000-7000-8000-00000000c001');
DELETE FROM categories WHERE id = '01930000-0000-7000-8000-00000000c001';
SELECT pg_temp.expect_true('hapus kategori kosong: item menu yang menunjuknya ikut terhapus',
  NOT EXISTS (SELECT 1 FROM menu_items WHERE label = 'Sementara'));
UPDATE articles SET updated_at = '2000-01-01' WHERE id = '01930000-0000-7000-8000-000000000602';
UPDATE articles SET title = title || ' (revisi)' WHERE id = '01930000-0000-7000-8000-000000000602';
SELECT pg_temp.expect_true('trigger updated_at berjalan',
  (SELECT updated_at > '2000-01-02' FROM articles WHERE id = '01930000-0000-7000-8000-000000000602'));
SELECT pg_temp.expect_true('uuidv7(): versi UUID = 7',
  (SELECT substr(uuidv7()::text, 15, 1) = '7'));

\echo '--- 5. Query publik ---'
SELECT pg_temp.expect_true('feed publik site A: hanya 2 artikel (tanpa draft & terjadwal)',
  (SELECT count(*) = 2 FROM articles
    WHERE site_id = '01930000-0000-7000-8000-000000000101'
      AND status = 'PUBLISHED' AND published_at <= now()));
SELECT pg_temp.expect_true('feed publik site B tidak memuat artikel site A',
  (SELECT bool_and(site_id = '01930000-0000-7000-8000-000000000102') FROM articles
    WHERE site_id = '01930000-0000-7000-8000-000000000102'
      AND status = 'PUBLISHED' AND published_at <= now()));
SELECT pg_temp.expect_true('pencarian "rendang" di site B menemukan 1 artikel',
  (SELECT count(*) = 1 FROM articles
    WHERE site_id = '01930000-0000-7000-8000-000000000102'
      AND status = 'PUBLISHED' AND published_at <= now()
      AND search_vector @@ plainto_tsquery('simple', 'rendang')));

\echo '--- 6. Hard delete site membersihkan semua datanya ---'
INSERT INTO sites (id, code, name) VALUES ('01930000-0000-7000-8000-00000000d001', 'site-sementara', 'Sementara');
INSERT INTO site_domains (site_id, domain, is_primary) VALUES ('01930000-0000-7000-8000-00000000d001', 'tmp.local.test', true);
INSERT INTO media (id, site_id, storage_key, mime_type, size_bytes)
VALUES ('01930000-0000-7000-8000-00000000d002', '01930000-0000-7000-8000-00000000d001', 'tmp/logo.png', 'image/png', 10);
UPDATE sites SET logo_media_id = '01930000-0000-7000-8000-00000000d002' WHERE id = '01930000-0000-7000-8000-00000000d001';
INSERT INTO categories (id, site_id, name, slug) VALUES ('01930000-0000-7000-8000-00000000d003', '01930000-0000-7000-8000-00000000d001', 'Umum', 'umum');
INSERT INTO tags (id, site_id, name, slug) VALUES ('01930000-0000-7000-8000-00000000d004', '01930000-0000-7000-8000-00000000d001', 'T', 't');
INSERT INTO articles (id, site_id, category_id, featured_media_id, title, slug)
VALUES ('01930000-0000-7000-8000-00000000d005', '01930000-0000-7000-8000-00000000d001', '01930000-0000-7000-8000-00000000d003',
        '01930000-0000-7000-8000-00000000d002', 'A', 'a');
INSERT INTO article_tags (site_id, article_id, tag_id)
VALUES ('01930000-0000-7000-8000-00000000d001', '01930000-0000-7000-8000-00000000d005', '01930000-0000-7000-8000-00000000d004');
INSERT INTO menus (id, site_id, location, name) VALUES ('01930000-0000-7000-8000-00000000d006', '01930000-0000-7000-8000-00000000d001', 'header', 'H');
INSERT INTO menu_items (site_id, menu_id, label, item_type, article_id)
VALUES ('01930000-0000-7000-8000-00000000d001', '01930000-0000-7000-8000-00000000d006', 'A', 'ARTICLE', '01930000-0000-7000-8000-00000000d005');
DELETE FROM sites WHERE id = '01930000-0000-7000-8000-00000000d001';
SELECT pg_temp.expect_true('tidak ada baris tersisa milik site yang dihapus',
  (SELECT (SELECT count(*) FROM site_domains WHERE site_id = '01930000-0000-7000-8000-00000000d001')
        + (SELECT count(*) FROM media        WHERE site_id = '01930000-0000-7000-8000-00000000d001')
        + (SELECT count(*) FROM articles     WHERE site_id = '01930000-0000-7000-8000-00000000d001')
        + (SELECT count(*) FROM article_tags WHERE site_id = '01930000-0000-7000-8000-00000000d001')
        + (SELECT count(*) FROM menu_items   WHERE site_id = '01930000-0000-7000-8000-00000000d001') = 0));

\echo '--- 7. Index dipakai pada 100.000 artikel ---'
INSERT INTO articles (site_id, category_id, title, slug, body_text, status, published_at)
SELECT '01930000-0000-7000-8000-000000000101',
       CASE WHEN g % 2 = 0 THEN '01930000-0000-7000-8000-000000000401'::uuid
            ELSE '01930000-0000-7000-8000-000000000402'::uuid END,
       'Artikel uji ' || g,
       'uji-' || g,
       'isi artikel uji nomor ' || g || CASE WHEN g % 1000 = 0 THEN ' kata-langka' ELSE '' END,
       CASE WHEN g % 10 = 0 THEN 'DRAFT' ELSE 'PUBLISHED' END,
       CASE WHEN g % 10 = 0 THEN NULL ELSE now() - make_interval(mins => g) END
  FROM generate_series(1, 100000) AS g;
ANALYZE articles;
ANALYZE article_tags;

SELECT pg_temp.expect_index('feed publik memakai idx_articles_public_feed', 'idx_articles_public_feed', $q$
  SELECT id, title FROM articles
   WHERE site_id = '01930000-0000-7000-8000-000000000101'
     AND status = 'PUBLISHED' AND published_at <= now()
   ORDER BY published_at DESC LIMIT 20 $q$);
SELECT pg_temp.expect_index('listing kategori memakai idx_articles_public_category', 'idx_articles_public_category', $q$
  SELECT id, title FROM articles
   WHERE site_id = '01930000-0000-7000-8000-000000000101'
     AND category_id = '01930000-0000-7000-8000-000000000402'
     AND status = 'PUBLISHED' AND published_at <= now()
   ORDER BY published_at DESC LIMIT 20 $q$);
SELECT pg_temp.expect_index('pencarian memakai idx_articles_search', 'idx_articles_search', $q$
  SELECT id FROM articles
   WHERE site_id = '01930000-0000-7000-8000-000000000101'
     AND search_vector @@ plainto_tsquery('simple', 'kata-langka') $q$);
SELECT pg_temp.expect_index('cek slug memakai uq_articles_site_slug', 'uq_articles_site_slug', $q$
  SELECT id FROM articles
   WHERE site_id = '01930000-0000-7000-8000-000000000101' AND slug = 'uji-500' $q$);

\echo '--- SEMUA TEST LULUS ---'
ROLLBACK;
