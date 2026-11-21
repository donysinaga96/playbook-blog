-- =====================================================================
-- dev_seed.sql  -  Data contoh untuk development (idempotent)
-- Dua site dengan topik & template berbeda dari SATU database:
--   kabar-tekno     -> template 'magazine'   (tekno.localhost)
--   dapur-nusantara -> template 'news'       (kuliner.localhost)
-- ID tetap (UUIDv7-format) + ON CONFLICT DO NOTHING = aman dijalankan ulang.
-- =====================================================================

BEGIN;

-- ---------- users ----------------------------------------------------
INSERT INTO users (id, email, display_name, is_superadmin) VALUES
  ('01930000-0000-7000-8000-000000000001', 'admin@local.test',   'Admin Lokal', true),
  ('01930000-0000-7000-8000-000000000002', 'penulis@local.test', 'Budi Penulis', false)
ON CONFLICT DO NOTHING;

-- ---------- sites & domains -----------------------------------------
INSERT INTO sites (id, code, name, settings) VALUES
  ('01930000-0000-7000-8000-000000000101', 'kabar-tekno', 'Kabar Tekno',
   '{"tagline": "Teknologi tanpa jargon", "permalink": "/:category/:slug",
     "seo": {"titleTemplate": "%s | Kabar Tekno", "defaultDescription": "Berita dan ulasan teknologi."}}'),
  ('01930000-0000-7000-8000-000000000102', 'dapur-nusantara', 'Dapur Nusantara',
   '{"tagline": "Resep rumahan dari seluruh Indonesia", "permalink": "/:category/:slug",
     "seo": {"titleTemplate": "%s - Dapur Nusantara", "defaultDescription": "Resep dan cerita kuliner Nusantara."}}')
ON CONFLICT DO NOTHING;

INSERT INTO site_domains (id, site_id, domain, is_primary, verified_at) VALUES
  ('01930000-0000-7000-8000-000000000111', '01930000-0000-7000-8000-000000000101', 'tekno.localhost',     true,  now()),
  ('01930000-0000-7000-8000-000000000112', '01930000-0000-7000-8000-000000000101', 'www.tekno.localhost', false, now()),
  ('01930000-0000-7000-8000-000000000121', '01930000-0000-7000-8000-000000000102', 'kuliner.localhost',   true,  now())
ON CONFLICT DO NOTHING;

INSERT INTO site_members (site_id, user_id, role) VALUES
  ('01930000-0000-7000-8000-000000000101', '01930000-0000-7000-8000-000000000001', 'OWNER'),
  ('01930000-0000-7000-8000-000000000102', '01930000-0000-7000-8000-000000000001', 'OWNER'),
  ('01930000-0000-7000-8000-000000000101', '01930000-0000-7000-8000-000000000002', 'AUTHOR')
ON CONFLICT DO NOTHING;

-- ---------- themes ---------------------------------------------------
-- dapur-nusantara menyimpan config 'magazine' (tidak aktif) untuk
-- menunjukkan bahwa config per template tidak hilang saat ganti template.
INSERT INTO site_themes (id, site_id, template_key, template_version, tokens, options, layouts, is_active) VALUES
  ('01930000-0000-7000-8000-000000000131', '01930000-0000-7000-8000-000000000101', 'magazine', '1.0.0',
   '{"color": {"primary": "#0f62fe", "surface": "#ffffff", "text": "#161616"},
     "font": {"heading": "Inter", "body": "Inter"}, "radius": {"card": "8px"}}',
   '{"header": {"style": "centered", "showDate": true}, "adSlots": {"header_banner": null}}',
   '{"home": [{"type": "hero", "props": {"source": "featured", "limit": 1}},
              {"type": "latest-grid", "props": {"limit": 6}},
              {"type": "category-strip", "props": {"categorySlug": "gadget", "limit": 4}}]}',
   true),
  ('01930000-0000-7000-8000-000000000141', '01930000-0000-7000-8000-000000000102', 'news', '1.0.0',
   '{"color": {"primary": "#b3261e", "surface": "#fffbf5", "text": "#1d1b16"},
     "font": {"heading": "Merriweather", "body": "Source Sans 3"}, "radius": {"card": "2px"}}',
   '{"header": {"style": "left", "showDate": false}}',
   '{"home": [{"type": "headline-list", "props": {"source": "latest", "limit": 5}},
              {"type": "category-strip", "props": {"categorySlug": "resep", "limit": 8}}]}',
   true),
  ('01930000-0000-7000-8000-000000000142', '01930000-0000-7000-8000-000000000102', 'magazine', '1.0.0',
   '{"color": {"primary": "#7a4a00"}}', '{}', '{}', false)
ON CONFLICT DO NOTHING;

-- ---------- media ----------------------------------------------------
INSERT INTO media (id, site_id, storage_key, mime_type, size_bytes, width, height, alt_text, focal_x, focal_y) VALUES
  ('01930000-0000-7000-8000-000000000201', '01930000-0000-7000-8000-000000000101', 'kabar-tekno/logo.svg',          'image/svg+xml', 2048,   240, 64,  'Logo Kabar Tekno', 0.5, 0.5),
  ('01930000-0000-7000-8000-000000000202', '01930000-0000-7000-8000-000000000101', 'kabar-tekno/2026/11/hp.webp',   'image/webp',    184320, 1600, 900, 'Ponsel lipat di atas meja', 0.62, 0.40),
  ('01930000-0000-7000-8000-000000000203', '01930000-0000-7000-8000-000000000101', 'kabar-tekno/2026/11/ai.webp',   'image/webp',    150000, 1600, 900, 'Ilustrasi jaringan saraf', 0.5, 0.5),
  ('01930000-0000-7000-8000-000000000211', '01930000-0000-7000-8000-000000000102', 'dapur-nusantara/logo.svg',      'image/svg+xml', 1900,   200, 64,  'Logo Dapur Nusantara', 0.5, 0.5),
  ('01930000-0000-7000-8000-000000000212', '01930000-0000-7000-8000-000000000102', 'dapur-nusantara/2026/11/rendang.webp', 'image/webp', 210000, 1600, 1067, 'Rendang di piring tanah liat', 0.45, 0.55)
ON CONFLICT DO NOTHING;

UPDATE sites SET logo_media_id = '01930000-0000-7000-8000-000000000201'
 WHERE id = '01930000-0000-7000-8000-000000000101' AND logo_media_id IS NULL;
UPDATE sites SET logo_media_id = '01930000-0000-7000-8000-000000000211'
 WHERE id = '01930000-0000-7000-8000-000000000102' AND logo_media_id IS NULL;

-- ---------- authors --------------------------------------------------
INSERT INTO authors (id, site_id, user_id, name, slug, bio) VALUES
  ('01930000-0000-7000-8000-000000000301', '01930000-0000-7000-8000-000000000101', NULL,                                   'Redaksi Kabar Tekno', 'redaksi', 'Tim redaksi.'),
  ('01930000-0000-7000-8000-000000000302', '01930000-0000-7000-8000-000000000101', '01930000-0000-7000-8000-000000000002', 'Budi Santoso',        'budi-santoso', 'Menulis soal gawai sejak 2015.'),
  ('01930000-0000-7000-8000-000000000311', '01930000-0000-7000-8000-000000000102', NULL,                                   'Redaksi Dapur',       'redaksi', 'Tim dapur.')
ON CONFLICT DO NOTHING;

-- ---------- categories -----------------------------------------------
INSERT INTO categories (id, site_id, parent_id, name, slug, sort_order) VALUES
  ('01930000-0000-7000-8000-000000000401', '01930000-0000-7000-8000-000000000101', NULL, 'Gadget',          'gadget',           1),
  ('01930000-0000-7000-8000-000000000402', '01930000-0000-7000-8000-000000000101', NULL, 'Kecerdasan Buatan','kecerdasan-buatan',2),
  ('01930000-0000-7000-8000-000000000403', '01930000-0000-7000-8000-000000000101', '01930000-0000-7000-8000-000000000401', 'Review', 'review', 1),
  ('01930000-0000-7000-8000-000000000411', '01930000-0000-7000-8000-000000000102', NULL, 'Resep',           'resep',            1),
  ('01930000-0000-7000-8000-000000000412', '01930000-0000-7000-8000-000000000102', NULL, 'Kuliner Daerah',  'kuliner-daerah',   2),
  ('01930000-0000-7000-8000-000000000413', '01930000-0000-7000-8000-000000000102', '01930000-0000-7000-8000-000000000412', 'Sumatera', 'sumatera', 1)
ON CONFLICT DO NOTHING;

-- ---------- tags -----------------------------------------------------
INSERT INTO tags (id, site_id, name, slug) VALUES
  ('01930000-0000-7000-8000-000000000501', '01930000-0000-7000-8000-000000000101', 'Android',     'android'),
  ('01930000-0000-7000-8000-000000000502', '01930000-0000-7000-8000-000000000101', 'Laptop',      'laptop'),
  ('01930000-0000-7000-8000-000000000511', '01930000-0000-7000-8000-000000000102', 'Pedas',       'pedas'),
  ('01930000-0000-7000-8000-000000000512', '01930000-0000-7000-8000-000000000102', 'Tradisional', 'tradisional')
ON CONFLICT DO NOTHING;

-- ---------- articles -------------------------------------------------
-- Per site: published (lampau), terjadwal (PUBLISHED + tanggal depan), draft.
INSERT INTO articles (id, site_id, category_id, author_id, featured_media_id, title, slug, excerpt,
                      body, body_text, status, is_featured, published_at, seo, attributes, created_by) VALUES
  ('01930000-0000-7000-8000-000000000601', '01930000-0000-7000-8000-000000000101',
   '01930000-0000-7000-8000-000000000403', '01930000-0000-7000-8000-000000000302', '01930000-0000-7000-8000-000000000202',
   'Ponsel lipat makin murah, layak dibeli?', 'ponsel-lipat-makin-murah',
   'Harga turun, engsel makin awet. Ini yang perlu dicek sebelum membeli.',
   '{"version": 1, "blocks": [
      {"type": "paragraph", "text": "Harga ponsel lipat turun tajam tahun ini."},
      {"type": "heading", "level": 2, "text": "Yang perlu dicek"},
      {"type": "list", "style": "bullet", "items": ["Engsel", "Lipatan layar", "Garansi"]},
      {"type": "image", "mediaId": "01930000-0000-7000-8000-000000000202", "caption": "Ponsel lipat generasi baru"}]}',
   'Harga ponsel lipat turun tajam tahun ini. Yang perlu dicek Engsel Lipatan layar Garansi',
   'PUBLISHED', true, '2026-11-10 08:00:00+07',
   '{"title": "Ponsel lipat makin murah: layak dibeli?", "description": "Checklist sebelum membeli ponsel lipat."}',
   '{"review": {"rating": 4.2, "pros": ["Layar besar"], "cons": ["Baterai"]}}',
   '01930000-0000-7000-8000-000000000002'),
  ('01930000-0000-7000-8000-000000000602', '01930000-0000-7000-8000-000000000101',
   '01930000-0000-7000-8000-000000000402', '01930000-0000-7000-8000-000000000301', '01930000-0000-7000-8000-000000000203',
   'Cara kerja model bahasa, tanpa matematika', 'cara-kerja-model-bahasa',
   'Penjelasan ringan tentang bagaimana model bahasa menebak kata berikutnya.',
   '{"version": 1, "blocks": [{"type": "paragraph", "text": "Model bahasa menebak kata berikutnya berdasarkan pola."}]}',
   'Model bahasa menebak kata berikutnya berdasarkan pola.',
   'PUBLISHED', false, '2026-11-12 10:00:00+07', '{}', '{}', '01930000-0000-7000-8000-000000000001'),
  ('01930000-0000-7000-8000-000000000603', '01930000-0000-7000-8000-000000000101',
   '01930000-0000-7000-8000-000000000401', '01930000-0000-7000-8000-000000000301', NULL,
   'Laptop terbaik untuk mahasiswa 2030', 'laptop-terbaik-mahasiswa-2030', 'Artikel terjadwal.',
   '{"version": 1, "blocks": [{"type": "paragraph", "text": "Belum tayang."}]}', 'Belum tayang.',
   'PUBLISHED', false, '2030-01-01 09:00:00+07', '{}', '{}', '01930000-0000-7000-8000-000000000001'),
  ('01930000-0000-7000-8000-000000000604', '01930000-0000-7000-8000-000000000101',
   '01930000-0000-7000-8000-000000000401', NULL, NULL,
   'Draf: ulasan earbuds', 'draf-ulasan-earbuds', NULL,
   '{"version": 1, "blocks": []}', '', 'DRAFT', false, NULL, '{}', '{}', '01930000-0000-7000-8000-000000000002'),
  ('01930000-0000-7000-8000-000000000611', '01930000-0000-7000-8000-000000000102',
   '01930000-0000-7000-8000-000000000413', '01930000-0000-7000-8000-000000000311', '01930000-0000-7000-8000-000000000212',
   'Rendang Padang yang empuk dalam 4 jam', 'rendang-padang-empuk',
   'Kunci rendang empuk: api kecil dan sabar.',
   '{"version": 1, "blocks": [
      {"type": "paragraph", "text": "Rendang butuh api kecil dan waktu."},
      {"type": "heading", "level": 2, "text": "Bahan"},
      {"type": "list", "style": "bullet", "items": ["1 kg daging sapi", "2 liter santan", "Bumbu halus"]}]}',
   'Rendang butuh api kecil dan waktu. Bahan 1 kg daging sapi 2 liter santan Bumbu halus',
   'PUBLISHED', true, '2026-11-11 07:00:00+07', '{}',
   '{"recipe": {"prepMinutes": 30, "cookMinutes": 240, "servings": 8}}', '01930000-0000-7000-8000-000000000001'),
  ('01930000-0000-7000-8000-000000000612', '01930000-0000-7000-8000-000000000102',
   '01930000-0000-7000-8000-000000000411', '01930000-0000-7000-8000-000000000311', NULL,
   'Sambal matah 10 menit', 'sambal-matah-10-menit', 'Sambal segar khas Bali.',
   '{"version": 1, "blocks": [{"type": "paragraph", "text": "Iris tipis, siram minyak panas."}]}',
   'Iris tipis, siram minyak panas.',
   'PUBLISHED', false, '2026-11-13 12:00:00+07', '{}', '{}', '01930000-0000-7000-8000-000000000001'),
  ('01930000-0000-7000-8000-000000000613', '01930000-0000-7000-8000-000000000102',
   '01930000-0000-7000-8000-000000000411', NULL, NULL,
   'Draf: soto betawi', 'draf-soto-betawi', NULL,
   '{"version": 1, "blocks": []}', '', 'DRAFT', false, NULL, '{}', '{}', '01930000-0000-7000-8000-000000000001')
ON CONFLICT DO NOTHING;

INSERT INTO article_tags (site_id, article_id, tag_id) VALUES
  ('01930000-0000-7000-8000-000000000101', '01930000-0000-7000-8000-000000000601', '01930000-0000-7000-8000-000000000501'),
  ('01930000-0000-7000-8000-000000000101', '01930000-0000-7000-8000-000000000603', '01930000-0000-7000-8000-000000000502'),
  ('01930000-0000-7000-8000-000000000102', '01930000-0000-7000-8000-000000000611', '01930000-0000-7000-8000-000000000511'),
  ('01930000-0000-7000-8000-000000000102', '01930000-0000-7000-8000-000000000611', '01930000-0000-7000-8000-000000000512')
ON CONFLICT DO NOTHING;

-- Revisi pertama = snapshot saat artikel dibuat (version 1).
INSERT INTO article_revisions (site_id, article_id, revision_no, snapshot, change_note, created_by)
SELECT a.site_id, a.id, a.version,
       jsonb_build_object(
         'title', a.title, 'slug', a.slug, 'excerpt', a.excerpt, 'body', a.body,
         'category_id', a.category_id, 'author_id', a.author_id,
         'featured_media_id', a.featured_media_id, 'format', a.format,
         'seo', a.seo, 'attributes', a.attributes,
         'tag_ids', COALESCE((SELECT jsonb_agg(t.tag_id ORDER BY t.sort_order, t.tag_id)
                                FROM article_tags t WHERE t.article_id = a.id), '[]'::jsonb)),
       'Seed awal', a.created_by
  FROM articles a
ON CONFLICT DO NOTHING;

-- ---------- pages ----------------------------------------------------
INSERT INTO pages (id, site_id, title, slug, body, view_key, status, published_at) VALUES
  ('01930000-0000-7000-8000-000000000701', '01930000-0000-7000-8000-000000000101', 'Tentang Kami', 'tentang-kami',
   '{"version": 1, "blocks": [{"type": "paragraph", "text": "Kabar Tekno menulis teknologi dengan bahasa sehari-hari."}]}',
   'default', 'PUBLISHED', '2026-11-01 00:00:00+07'),
  ('01930000-0000-7000-8000-000000000711', '01930000-0000-7000-8000-000000000102', 'Tentang Kami', 'tentang-kami',
   '{"version": 1, "blocks": [{"type": "paragraph", "text": "Dapur Nusantara mengumpulkan resep rumahan."}]}',
   'default', 'PUBLISHED', '2026-11-01 00:00:00+07'),
  ('01930000-0000-7000-8000-000000000712', '01930000-0000-7000-8000-000000000102', 'Kontak', 'kontak',
   '{"version": 1, "blocks": []}', 'contact', 'PUBLISHED', '2026-11-01 00:00:00+07')
ON CONFLICT DO NOTHING;

-- ---------- menus ----------------------------------------------------
INSERT INTO menus (id, site_id, location, name) VALUES
  ('01930000-0000-7000-8000-000000000801', '01930000-0000-7000-8000-000000000101', 'header', 'Menu utama'),
  ('01930000-0000-7000-8000-000000000802', '01930000-0000-7000-8000-000000000101', 'footer', 'Menu bawah'),
  ('01930000-0000-7000-8000-000000000811', '01930000-0000-7000-8000-000000000102', 'header', 'Menu utama'),
  ('01930000-0000-7000-8000-000000000812', '01930000-0000-7000-8000-000000000102', 'footer', 'Menu bawah')
ON CONFLICT DO NOTHING;

INSERT INTO menu_items (id, site_id, menu_id, parent_id, label, item_type, category_id, page_id, url, sort_order) VALUES
  -- kabar-tekno / header
  ('01930000-0000-7000-8000-000000000901', '01930000-0000-7000-8000-000000000101', '01930000-0000-7000-8000-000000000801', NULL,
   'Beranda', 'ROUTE', NULL, NULL, '/', 1),
  ('01930000-0000-7000-8000-000000000902', '01930000-0000-7000-8000-000000000101', '01930000-0000-7000-8000-000000000801', NULL,
   'Gadget', 'CATEGORY', '01930000-0000-7000-8000-000000000401', NULL, NULL, 2),
  ('01930000-0000-7000-8000-000000000903', '01930000-0000-7000-8000-000000000101', '01930000-0000-7000-8000-000000000801', '01930000-0000-7000-8000-000000000902',
   'Review', 'CATEGORY', '01930000-0000-7000-8000-000000000403', NULL, NULL, 1),
  ('01930000-0000-7000-8000-000000000904', '01930000-0000-7000-8000-000000000101', '01930000-0000-7000-8000-000000000801', NULL,
   'AI', 'CATEGORY', '01930000-0000-7000-8000-000000000402', NULL, NULL, 3),
  -- kabar-tekno / footer
  ('01930000-0000-7000-8000-000000000905', '01930000-0000-7000-8000-000000000101', '01930000-0000-7000-8000-000000000802', NULL,
   'Tentang Kami', 'PAGE', NULL, '01930000-0000-7000-8000-000000000701', NULL, 1),
  ('01930000-0000-7000-8000-000000000906', '01930000-0000-7000-8000-000000000101', '01930000-0000-7000-8000-000000000802', NULL,
   'X / Twitter', 'URL', NULL, NULL, 'https://x.com/kabartekno', 2),
  -- dapur-nusantara / header
  ('01930000-0000-7000-8000-000000000911', '01930000-0000-7000-8000-000000000102', '01930000-0000-7000-8000-000000000811', NULL,
   'Beranda', 'ROUTE', NULL, NULL, '/', 1),
  ('01930000-0000-7000-8000-000000000912', '01930000-0000-7000-8000-000000000102', '01930000-0000-7000-8000-000000000811', NULL,
   'Resep', 'CATEGORY', '01930000-0000-7000-8000-000000000411', NULL, NULL, 2),
  ('01930000-0000-7000-8000-000000000913', '01930000-0000-7000-8000-000000000102', '01930000-0000-7000-8000-000000000811', NULL,
   'Kuliner Daerah', 'CATEGORY', '01930000-0000-7000-8000-000000000412', NULL, NULL, 3),
  ('01930000-0000-7000-8000-000000000914', '01930000-0000-7000-8000-000000000102', '01930000-0000-7000-8000-000000000811', '01930000-0000-7000-8000-000000000913',
   'Sumatera', 'CATEGORY', '01930000-0000-7000-8000-000000000413', NULL, NULL, 1),
  -- dapur-nusantara / footer
  ('01930000-0000-7000-8000-000000000915', '01930000-0000-7000-8000-000000000102', '01930000-0000-7000-8000-000000000812', NULL,
   'Kontak', 'PAGE', NULL, '01930000-0000-7000-8000-000000000712', NULL, 1)
ON CONFLICT DO NOTHING;

-- ---------- redirects ------------------------------------------------
INSERT INTO redirects (id, site_id, from_path, to_path, status_code) VALUES
  ('01930000-0000-7000-8000-000000000a01', '01930000-0000-7000-8000-000000000101',
   '/gadget/ponsel-lipat-murah', '/review/ponsel-lipat-makin-murah', 301)
ON CONFLICT DO NOTHING;

COMMIT;
