-- =====================================================================
-- 0001_core.sql  -  Schema inti v1
-- Site, domain, tema/template, user, media, author, kategori, tag,
-- artikel (+ revisi), halaman statis, menu, redirect.
--
-- Target  : PostgreSQL 18 (uuidv7() bawaan). PostgreSQL 15-17 didukung
--           lewat shim uuidv7() di bagian 0 (butuh PG 15+ untuk
--           ON DELETE SET NULL (kolom)).
-- Aturan  : 1. Setiap tabel milik site punya site_id NOT NULL.
--           2. Setiap tabel yang dirujuk lintas tabel punya
--              UNIQUE (site_id, id) agar bisa jadi target composite FK.
--           3. Relasi antar tabel milik site SELALU lewat composite FK
--              (site_id, xxx_id) -> (site_id, id). Database menolak relasi
--              lintas site, bukan hanya aplikasi.
--           4. Status disimpan sebagai text + CHECK (mudah dievolusi),
--              bukan PostgreSQL ENUM.
--           5. Semua waktu timestamptz (disimpan UTC).
-- Jalankan: scripts/migrate.sh membungkus file ini + catatan di
--           schema_migrations dalam SATU transaksi. Karena itu file
--           migration TIDAK boleh berisi BEGIN/COMMIT sendiri.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Kompatibilitas: uuidv7() untuk PostgreSQL < 18
--    Di PG 18 fungsi bawaan pg_catalog.uuidv7() dipakai dan shim ini
--    tidak dibuat. Setelah upgrade ke 18, pg_catalog didahulukan oleh
--    search_path, jadi shim lama otomatis tidak terpakai.
-- ---------------------------------------------------------------------
DO $do$
BEGIN
  IF current_setting('server_version_num')::int < 180000 THEN
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public.uuidv7() RETURNS uuid
      LANGUAGE sql VOLATILE AS $body$
        SELECT encode(
                 set_bit(
                   set_bit(
                     overlay(uuid_send(gen_random_uuid())
                             PLACING substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
                             FROM 1 FOR 6),
                     52, 1),
                   53, 1),
                 'hex')::uuid
      $body$
    $f$;
  END IF;
END
$do$;

-- ---------------------------------------------------------------------
-- 1. Helper: updated_at otomatis
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

-- =====================================================================
-- A. TENANT ROOT
-- =====================================================================

CREATE TABLE sites (
  id                uuid        PRIMARY KEY DEFAULT uuidv7(),
  code              text        NOT NULL,
  name              text        NOT NULL,
  status            text        NOT NULL DEFAULT 'ACTIVE',
  default_locale    text        NOT NULL DEFAULT 'id-ID',
  timezone          text        NOT NULL DEFAULT 'Asia/Jakarta',
  -- Identitas & default non-visual: tagline, permalink pattern, SEO default,
  -- social links, analytics id. Divalidasi skema Zod di packages/core.
  settings          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  logo_media_id     uuid,
  favicon_media_id  uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sites_code_format     CHECK (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(code) <= 50),
  CONSTRAINT sites_status_valid    CHECK (status IN ('ACTIVE', 'SUSPENDED', 'ARCHIVED')),
  CONSTRAINT sites_settings_object CHECK (jsonb_typeof(settings) = 'object')
);
CREATE UNIQUE INDEX uq_sites_code ON sites (code);
COMMENT ON TABLE sites IS 'Satu baris = satu website/produk (tenant). Produksi: arsipkan (ARCHIVED), jangan hapus.';

CREATE TABLE site_domains (
  id           uuid        PRIMARY KEY DEFAULT uuidv7(),
  site_id      uuid        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  -- Disimpan sudah dinormalisasi: huruf kecil, tanpa protokol, path, atau port.
  domain       text        NOT NULL,
  is_primary   boolean     NOT NULL DEFAULT false,
  status       text        NOT NULL DEFAULT 'ACTIVE',
  verified_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_domains_status_valid  CHECK (status IN ('PENDING', 'ACTIVE', 'DISABLED')),
  CONSTRAINT site_domains_domain_format CHECK (
    domain = lower(domain)
    AND length(domain) <= 253
    AND domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
  )
);
CREATE UNIQUE INDEX uq_site_domains_domain      ON site_domains (domain);
CREATE UNIQUE INDEX uq_site_domains_one_primary ON site_domains (site_id) WHERE is_primary;
CREATE INDEX        idx_site_domains_site       ON site_domains (site_id);
COMMENT ON TABLE site_domains IS 'Host -> site. Domain lokal harus punya titik, mis. tekno.local.test.';

-- Konfigurasi tampilan per site PER template. Ganti template = pindah baris
-- aktif; config template lama tetap tersimpan bila admin kembali.
CREATE TABLE site_themes (
  id                uuid        PRIMARY KEY DEFAULT uuidv7(),
  site_id           uuid        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  template_key      text        NOT NULL,                 -- 'magazine', 'news', ...
  template_version  text        NOT NULL,                 -- versi manifest saat config disimpan
  tokens            jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- design token -> CSS variable
  options           jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- opsi non-token (gaya header, slot iklan, dst.)
  layouts           jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- susunan section per jenis halaman
  is_active         boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_themes_key_format     CHECK (template_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT site_themes_version_semver CHECK (template_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  CONSTRAINT site_themes_json_objects   CHECK (jsonb_typeof(tokens) = 'object'
                                           AND jsonb_typeof(options) = 'object'
                                           AND jsonb_typeof(layouts) = 'object')
);
CREATE UNIQUE INDEX uq_site_themes_site_template ON site_themes (site_id, template_key);
CREATE UNIQUE INDEX uq_site_themes_one_active    ON site_themes (site_id) WHERE is_active;

-- =====================================================================
-- B. IDENTITAS & AKSES
-- =====================================================================

CREATE TABLE users (
  id             uuid        PRIMARY KEY DEFAULT uuidv7(),
  email          text        NOT NULL,
  password_hash  text,                                   -- Argon2id; NULL bila login lewat provider lain
  display_name   text        NOT NULL,
  is_superadmin  boolean     NOT NULL DEFAULT false,     -- akses semua site (mode ALL SITES)
  status         text        NOT NULL DEFAULT 'ACTIVE',
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_normalized CHECK (email = lower(email) AND position('@' IN email) > 1),
  CONSTRAINT users_status_valid     CHECK (status IN ('ACTIVE', 'DISABLED'))
);
CREATE UNIQUE INDEX uq_users_email ON users (email);
COMMENT ON TABLE users IS 'Akun login global. Bukan byline publik (lihat authors).';

-- Pengganti site_users + user_site_roles + roles + permissions.
-- Matriks role -> permission ada di kode (packages/core) sampai butuh tabel.
CREATE TABLE site_members (
  site_id     uuid        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, user_id),
  CONSTRAINT site_members_role_valid CHECK (role IN ('OWNER', 'EDITOR', 'AUTHOR'))
);
CREATE INDEX idx_site_members_user ON site_members (user_id);

-- =====================================================================
-- C. MEDIA
-- =====================================================================

CREATE TABLE media (
  id           uuid         PRIMARY KEY DEFAULT uuidv7(),
  site_id      uuid         NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  storage_key  text         NOT NULL,                   -- mis. 'tekno/2026/11/<uuid>.webp' (bukan URL)
  mime_type    text         NOT NULL,
  size_bytes   bigint       NOT NULL,
  width        integer,
  height       integer,
  alt_text     text,
  caption      text,
  credit       text,
  -- Titik fokus 0..1: template berbeda bisa crop rasio berbeda tanpa
  -- kehilangan subjek gambar.
  focal_x      numeric(4,3) NOT NULL DEFAULT 0.5,
  focal_y      numeric(4,3) NOT NULL DEFAULT 0.5,
  created_by   uuid         REFERENCES users (id) ON DELETE SET NULL,
  created_at   timestamptz  NOT NULL DEFAULT now(),
  updated_at   timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT media_site_id_id     UNIQUE (site_id, id),
  CONSTRAINT media_size_positive  CHECK (size_bytes > 0),
  CONSTRAINT media_dimensions     CHECK ((width IS NULL) = (height IS NULL) AND (width IS NULL OR (width > 0 AND height > 0))),
  CONSTRAINT media_focal_range    CHECK (focal_x BETWEEN 0 AND 1 AND focal_y BETWEEN 0 AND 1)
);
CREATE UNIQUE INDEX uq_media_storage_key ON media (storage_key);
CREATE INDEX        idx_media_site_created ON media (site_id, created_at DESC);

-- Logo & favicon site harus media milik site itu sendiri.
ALTER TABLE sites
  ADD CONSTRAINT fk_sites_logo_same_site
      FOREIGN KEY (id, logo_media_id) REFERENCES media (site_id, id) ON DELETE SET NULL (logo_media_id),
  ADD CONSTRAINT fk_sites_favicon_same_site
      FOREIGN KEY (id, favicon_media_id) REFERENCES media (site_id, id) ON DELETE SET NULL (favicon_media_id);

-- =====================================================================
-- D. KONTEN
-- =====================================================================

-- Byline publik per site. Boleh tertaut ke akun login (harus anggota site),
-- boleh juga persona tanpa akun (mis. "Redaksi").
CREATE TABLE authors (
  id               uuid        PRIMARY KEY DEFAULT uuidv7(),
  site_id          uuid        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  user_id          uuid,
  name             text        NOT NULL,
  slug             text        NOT NULL,
  bio              text,
  avatar_media_id  uuid,
  links            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status           text        NOT NULL DEFAULT 'ACTIVE',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT authors_site_id_id    UNIQUE (site_id, id),
  CONSTRAINT authors_slug_format   CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 200),
  CONSTRAINT authors_status_valid  CHECK (status IN ('ACTIVE', 'HIDDEN')),
  CONSTRAINT authors_links_object  CHECK (jsonb_typeof(links) = 'object'),
  CONSTRAINT fk_authors_member     FOREIGN KEY (site_id, user_id)
             REFERENCES site_members (site_id, user_id) ON DELETE SET NULL (user_id),
  CONSTRAINT fk_authors_avatar     FOREIGN KEY (site_id, avatar_media_id)
             REFERENCES media (site_id, id) ON DELETE SET NULL (avatar_media_id)
);
CREATE UNIQUE INDEX uq_authors_site_slug ON authors (site_id, slug);
CREATE UNIQUE INDEX uq_authors_site_user ON authors (site_id, user_id) WHERE user_id IS NOT NULL;

CREATE TABLE categories (
  id           uuid        PRIMARY KEY DEFAULT uuidv7(),
  site_id      uuid        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  parent_id    uuid,
  name         text        NOT NULL,
  slug         text        NOT NULL,
  description  text,
  sort_order   integer     NOT NULL DEFAULT 0,
  status       text        NOT NULL DEFAULT 'ACTIVE',
  seo          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categories_site_id_id      UNIQUE (site_id, id),
  CONSTRAINT categories_slug_format     CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 200),
  CONSTRAINT categories_status_valid    CHECK (status IN ('ACTIVE', 'HIDDEN')),
  CONSTRAINT categories_not_own_parent  CHECK (parent_id IS DISTINCT FROM id),
  CONSTRAINT categories_seo_object      CHECK (jsonb_typeof(seo) = 'object'),
  -- Siklus lebih dari 1 level (A->B->A) dicegah di packages/core.
  CONSTRAINT fk_categories_parent_same_site FOREIGN KEY (site_id, parent_id)
             REFERENCES categories (site_id, id)
);
CREATE UNIQUE INDEX uq_categories_site_slug ON categories (site_id, slug);
CREATE INDEX        idx_categories_parent   ON categories (site_id, parent_id, sort_order);

CREATE TABLE tags (
  id          uuid        PRIMARY KEY DEFAULT uuidv7(),
  site_id     uuid        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  name        text        NOT NULL,
  slug        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tags_site_id_id    UNIQUE (site_id, id),
  CONSTRAINT tags_slug_format   CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 200)
);
CREATE UNIQUE INDEX uq_tags_site_slug ON tags (site_id, slug);

-- Status: DRAFT -> (REVIEW) -> PUBLISHED -> ARCHIVED.
-- Terjadwal  = status PUBLISHED + published_at > now()  (tidak perlu queue).
-- Tampil publik = status PUBLISHED + published_at <= now().
CREATE TABLE articles (
  id                 uuid        PRIMARY KEY DEFAULT uuidv7(),
  site_id            uuid        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  category_id        uuid        NOT NULL,
  author_id          uuid,
  featured_media_id  uuid,
  title              text        NOT NULL,
  slug               text        NOT NULL,
  excerpt            text,
  body               jsonb       NOT NULL DEFAULT '{"version": 1, "blocks": []}'::jsonb,
  body_text          text        NOT NULL DEFAULT '',   -- teks polos hasil ekstraksi block oleh aplikasi
  format             text        NOT NULL DEFAULT 'STANDARD',
  status             text        NOT NULL DEFAULT 'DRAFT',
  is_featured        boolean     NOT NULL DEFAULT false,
  published_at       timestamptz,
  seo                jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- title, description, canonical, og_image_id, robots
  attributes         jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- titik ekstensi per topik (rating review, waktu masak, ...)
  version            integer     NOT NULL DEFAULT 1,            -- optimistic locking; = revision_no snapshot terakhir
  created_by         uuid        REFERENCES users (id) ON DELETE SET NULL,
  updated_by         uuid        REFERENCES users (id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  search_vector      tsvector GENERATED ALWAYS AS (
                       setweight(to_tsvector('simple', coalesce(title, '')),   'A') ||
                       setweight(to_tsvector('simple', coalesce(excerpt, '')), 'B') ||
                       setweight(to_tsvector('simple', body_text),             'C')
                     ) STORED,
  CONSTRAINT articles_site_id_id          UNIQUE (site_id, id),
  CONSTRAINT articles_slug_format         CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 200),
  CONSTRAINT articles_status_valid        CHECK (status IN ('DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED')),
  CONSTRAINT articles_format_valid        CHECK (format IN ('STANDARD', 'LISTICLE', 'GALLERY', 'VIDEO')),
  CONSTRAINT articles_published_has_date  CHECK (status <> 'PUBLISHED' OR published_at IS NOT NULL),
  CONSTRAINT articles_version_positive    CHECK (version > 0),
  CONSTRAINT articles_body_shape          CHECK (jsonb_typeof(body) = 'object'
                                              AND jsonb_typeof(body -> 'version') = 'number'
                                              AND jsonb_typeof(body -> 'blocks')  = 'array'),
  CONSTRAINT articles_json_objects        CHECK (jsonb_typeof(seo) = 'object' AND jsonb_typeof(attributes) = 'object'),
  CONSTRAINT fk_articles_category_same_site FOREIGN KEY (site_id, category_id)
             REFERENCES categories (site_id, id),
  CONSTRAINT fk_articles_author_same_site   FOREIGN KEY (site_id, author_id)
             REFERENCES authors (site_id, id) ON DELETE SET NULL (author_id),
  CONSTRAINT fk_articles_media_same_site    FOREIGN KEY (site_id, featured_media_id)
             REFERENCES media (site_id, id) ON DELETE SET NULL (featured_media_id)
);
CREATE UNIQUE INDEX uq_articles_site_slug         ON articles (site_id, slug);
-- Index publik: partial, hanya baris PUBLISHED -> kecil & cepat.
CREATE INDEX idx_articles_public_feed      ON articles (site_id, published_at DESC) WHERE status = 'PUBLISHED';
CREATE INDEX idx_articles_public_category  ON articles (site_id, category_id, published_at DESC) WHERE status = 'PUBLISHED';
CREATE INDEX idx_articles_public_author    ON articles (site_id, author_id, published_at DESC) WHERE status = 'PUBLISHED';
CREATE INDEX idx_articles_public_featured  ON articles (site_id, published_at DESC) WHERE status = 'PUBLISHED' AND is_featured;
-- Index admin & pencarian.
CREATE INDEX idx_articles_admin_list       ON articles (site_id, status, updated_at DESC);
CREATE INDEX idx_articles_search           ON articles USING gin (search_vector);

CREATE TABLE article_tags (
  site_id     uuid     NOT NULL,
  article_id  uuid     NOT NULL,
  tag_id      uuid     NOT NULL,
  sort_order  smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (article_id, tag_id),
  CONSTRAINT fk_article_tags_article_same_site FOREIGN KEY (site_id, article_id)
             REFERENCES articles (site_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_article_tags_tag_same_site     FOREIGN KEY (site_id, tag_id)
             REFERENCES tags (site_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_article_tags_tag ON article_tags (site_id, tag_id);

-- Snapshot lengkap (bukan hanya body) agar restore tidak kehilangan data.
-- revision_no = articles.version saat snapshot dibuat.
CREATE TABLE article_revisions (
  id           uuid        PRIMARY KEY DEFAULT uuidv7(),
  site_id      uuid        NOT NULL,
  article_id   uuid        NOT NULL,
  revision_no  integer     NOT NULL,
  snapshot     jsonb       NOT NULL,   -- title, slug, excerpt, body, category_id, author_id, featured_media_id, tag_ids, seo, attributes, format
  change_note  text,
  created_by   uuid        REFERENCES users (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT article_revisions_no_positive    CHECK (revision_no > 0),
  CONSTRAINT article_revisions_snapshot_obj   CHECK (jsonb_typeof(snapshot) = 'object'),
  CONSTRAINT fk_article_revisions_same_site   FOREIGN KEY (site_id, article_id)
             REFERENCES articles (site_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX uq_article_revisions_article_no ON article_revisions (article_id, revision_no);

-- Halaman statis: Tentang, Kontak, Kebijakan Privasi, dst.
CREATE TABLE pages (
  id            uuid        PRIMARY KEY DEFAULT uuidv7(),
  site_id       uuid        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  title         text        NOT NULL,
  slug          text        NOT NULL,
  body          jsonb       NOT NULL DEFAULT '{"version": 1, "blocks": []}'::jsonb,
  view_key      text        NOT NULL DEFAULT 'default',  -- varian view template, mis. 'contact'
  status        text        NOT NULL DEFAULT 'DRAFT',
  published_at  timestamptz,
  seo           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pages_site_id_id          UNIQUE (site_id, id),
  CONSTRAINT pages_slug_format         CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 200),
  CONSTRAINT pages_view_key_format     CHECK (view_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT pages_status_valid        CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  CONSTRAINT pages_published_has_date  CHECK (status <> 'PUBLISHED' OR published_at IS NOT NULL),
  CONSTRAINT pages_body_shape          CHECK (jsonb_typeof(body) = 'object'
                                          AND jsonb_typeof(body -> 'version') = 'number'
                                          AND jsonb_typeof(body -> 'blocks')  = 'array'),
  CONSTRAINT pages_seo_object          CHECK (jsonb_typeof(seo) = 'object')
);
CREATE UNIQUE INDEX uq_pages_site_slug ON pages (site_id, slug);

-- =====================================================================
-- E. NAVIGASI & URL
-- =====================================================================

CREATE TABLE menus (
  id          uuid        PRIMARY KEY DEFAULT uuidv7(),
  site_id     uuid        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  location    text        NOT NULL,   -- 'header', 'footer', ... (didefinisikan template)
  name        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT menus_site_id_id       UNIQUE (site_id, id),
  CONSTRAINT menus_location_format  CHECK (location ~ '^[a-z0-9]+(_[a-z0-9]+)*$')
);
CREATE UNIQUE INDEX uq_menus_site_location ON menus (site_id, location);

-- Target bertipe dengan FK nyata (bukan entity_type + entity_id polimorfik).
-- Item ikut terhapus bila kategori/artikel/halaman/tag tujuannya dihapus.
CREATE TABLE menu_items (
  id               uuid        PRIMARY KEY DEFAULT uuidv7(),
  site_id          uuid        NOT NULL,
  menu_id          uuid        NOT NULL,
  parent_id        uuid,
  label            text        NOT NULL,
  item_type        text        NOT NULL,
  category_id      uuid,
  article_id       uuid,
  page_id          uuid,
  tag_id           uuid,
  url              text,       -- URL: https://...  ROUTE: /path internal
  open_in_new_tab  boolean     NOT NULL DEFAULT false,
  sort_order       integer     NOT NULL DEFAULT 0,
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT menu_items_menu_id_id       UNIQUE (menu_id, id),
  CONSTRAINT menu_items_type_valid       CHECK (item_type IN ('CATEGORY', 'ARTICLE', 'PAGE', 'TAG', 'URL', 'ROUTE')),
  CONSTRAINT menu_items_target_matches   CHECK (
        (item_type = 'CATEGORY')          = (category_id IS NOT NULL)
    AND (item_type = 'ARTICLE')           = (article_id  IS NOT NULL)
    AND (item_type = 'PAGE')              = (page_id     IS NOT NULL)
    AND (item_type = 'TAG')               = (tag_id      IS NOT NULL)
    AND (item_type IN ('URL', 'ROUTE'))   = (url         IS NOT NULL)
  ),
  -- Menolak javascript:, data:, dan URL protocol-relative (//host).
  CONSTRAINT menu_items_url_safe         CHECK (
        url IS NULL
     OR (item_type = 'URL'   AND url ~ '^https?://[^[:space:]]+$')
     OR (item_type = 'ROUTE' AND url ~ '^/[^[:space:]]*$' AND url !~ '^//')
  ),
  CONSTRAINT menu_items_not_own_parent   CHECK (parent_id IS DISTINCT FROM id),
  CONSTRAINT fk_menu_items_menu_same_site   FOREIGN KEY (site_id, menu_id)
             REFERENCES menus (site_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_menu_items_parent_same_menu FOREIGN KEY (menu_id, parent_id)
             REFERENCES menu_items (menu_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_menu_items_category  FOREIGN KEY (site_id, category_id) REFERENCES categories (site_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_menu_items_article   FOREIGN KEY (site_id, article_id)  REFERENCES articles   (site_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_menu_items_page      FOREIGN KEY (site_id, page_id)     REFERENCES pages      (site_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_menu_items_tag       FOREIGN KEY (site_id, tag_id)      REFERENCES tags       (site_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_menu_items_tree ON menu_items (menu_id, parent_id, sort_order);

-- Dibuat otomatis oleh aplikasi saat slug artikel/kategori/halaman berubah.
CREATE TABLE redirects (
  id           uuid        PRIMARY KEY DEFAULT uuidv7(),
  site_id      uuid        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  from_path    text        NOT NULL,
  to_path      text        NOT NULL,
  status_code  smallint    NOT NULL DEFAULT 301,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT redirects_status_valid CHECK (status_code IN (301, 302, 307, 308)),
  CONSTRAINT redirects_from_path    CHECK (from_path ~ '^/[^[:space:]]*$' AND from_path !~ '^//'),
  CONSTRAINT redirects_to_path      CHECK ((to_path ~ '^/[^[:space:]]*$' AND to_path !~ '^//')
                                        OR to_path ~ '^https?://[^[:space:]]+$'),
  CONSTRAINT redirects_not_self     CHECK (from_path <> to_path)
);
CREATE UNIQUE INDEX uq_redirects_site_from ON redirects (site_id, from_path);

-- =====================================================================
-- F. Trigger updated_at untuk semua tabel yang punya kolomnya
-- =====================================================================
DO $do$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sites', 'site_domains', 'site_themes', 'users', 'media', 'authors',
    'categories', 'tags', 'articles', 'pages', 'menus', 'menu_items', 'redirects'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$I
         FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END
$do$;
