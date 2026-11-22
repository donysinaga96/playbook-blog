-- =====================================================================
-- 0002_konten_ai.sql  -  Hasil AI agent, referensi artikel, sumber media
-- (ADR-010, M5a). Status articles TIDAK berubah.
--
--   generated_articles  : hasil AI menunggu keputusan pemilik proyek.
--                         Tidak pernah dibaca halaman publik. Approve di
--                         admin memindahkan isinya ke tabel konten.
--   article_references  : sumber yang dipakai artikel; tampil di halaman.
--   media.source_url    : halaman asal gambar yang diambil dari sumber lain.
--
-- Hak role agent (blog_agent) diatur di scripts/agent_role.sql, bukan di
-- sini, karena nama role berasal dari env.
-- =====================================================================

-- ---------- media: asal gambar --------------------------------------
ALTER TABLE media
  ADD COLUMN source_url text,
  ADD CONSTRAINT media_source_url_format
      CHECK (source_url IS NULL OR (source_url ~ '^https?://[^[:space:]]+$' AND length(source_url) <= 2048));

-- ---------- referensi artikel ---------------------------------------
CREATE TABLE article_references (
  id          uuid        PRIMARY KEY DEFAULT uuidv7(),
  site_id     uuid        NOT NULL,
  article_id  uuid        NOT NULL,
  position    smallint    NOT NULL,              -- urutan tampil, mulai 1
  title       text        NOT NULL,
  url         text        NOT NULL,
  publisher   text,
  kind        text        NOT NULL DEFAULT 'ARTICLE',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT article_references_position_positive CHECK (position > 0),
  CONSTRAINT article_references_title_length      CHECK (length(btrim(title)) BETWEEN 1 AND 300),
  CONSTRAINT article_references_url_format        CHECK (url ~ '^https?://[^[:space:]]+$' AND length(url) <= 2048),
  CONSTRAINT article_references_publisher_length  CHECK (publisher IS NULL OR length(btrim(publisher)) BETWEEN 1 AND 200),
  CONSTRAINT article_references_kind_valid        CHECK (kind IN ('ARTICLE', 'VIDEO', 'IMAGE', 'OTHER')),
  CONSTRAINT fk_article_references_same_site      FOREIGN KEY (site_id, article_id)
             REFERENCES articles (site_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX uq_article_references_position ON article_references (article_id, position);
CREATE UNIQUE INDEX uq_article_references_url      ON article_references (article_id, url);

CREATE TRIGGER trg_article_references_updated_at BEFORE UPDATE ON article_references
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- hasil AI --------------------------------------------------
-- Status: READY_TO_PUBLISH -> APPROVED (dipindah ke articles) | ARCHIVED (ditolak).
-- payload: bentuknya dijaga skema Zod generatedPayloadSchema di
-- packages/core; database hanya menjamin object.
CREATE TABLE generated_articles (
  id            uuid        PRIMARY KEY DEFAULT uuidv7(),
  site_id       uuid        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  external_id   text        NOT NULL,            -- ID buatan agent, unik per site
  status        text        NOT NULL DEFAULT 'READY_TO_PUBLISH',
  payload       jsonb       NOT NULL,
  agent_note    text,                            -- ringkasan tinjauan AI, tampil di approval
  generated_at  timestamptz NOT NULL DEFAULT now(),
  review_note   text,                            -- alasan keputusan; wajib bila ditolak
  reviewed_by   uuid        REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at   timestamptz,
  article_id    uuid,                            -- artikel hasil approve
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT generated_articles_status_valid       CHECK (status IN ('READY_TO_PUBLISH', 'APPROVED', 'ARCHIVED')),
  CONSTRAINT generated_articles_external_id_length CHECK (length(external_id) BETWEEN 1 AND 200),
  CONSTRAINT generated_articles_payload_object     CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT generated_articles_agent_note_length  CHECK (agent_note IS NULL OR length(agent_note) <= 5000),
  -- Sudah diputuskan <=> ada waktu keputusan.
  CONSTRAINT generated_articles_reviewed_when_decided
             CHECK ((status = 'READY_TO_PUBLISH') = (reviewed_at IS NULL)),
  CONSTRAINT generated_articles_archived_has_note
             CHECK (status <> 'ARCHIVED' OR length(btrim(coalesce(review_note, ''))) > 0),
  CONSTRAINT generated_articles_article_only_approved
             CHECK (article_id IS NULL OR status = 'APPROVED'),
  CONSTRAINT fk_generated_articles_article_same_site FOREIGN KEY (site_id, article_id)
             REFERENCES articles (site_id, id) ON DELETE SET NULL (article_id)
);
CREATE UNIQUE INDEX uq_generated_articles_external ON generated_articles (site_id, external_id);
-- Antrian approval: yang menunggu, terbaru dulu.
CREATE INDEX idx_generated_articles_queue ON generated_articles (site_id, generated_at DESC)
  WHERE status = 'READY_TO_PUBLISH';

CREATE TRIGGER trg_generated_articles_updated_at BEFORE UPDATE ON generated_articles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Hasil yang sudah diputuskan tidak boleh diubah isinya atau keputusannya,
-- oleh siapa pun (agent maupun aplikasi). Yang masih boleh berubah hanya
-- rujukan yang dikosongkan FK: reviewed_by dan article_id (SET NULL).
-- Transisi hanya dari READY_TO_PUBLISH; CHECK di atas menjaga sisanya.
CREATE FUNCTION generated_articles_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'READY_TO_PUBLISH' AND (
       NEW.status       IS DISTINCT FROM OLD.status       OR
       NEW.site_id      IS DISTINCT FROM OLD.site_id      OR
       NEW.external_id  IS DISTINCT FROM OLD.external_id  OR
       NEW.payload      IS DISTINCT FROM OLD.payload      OR
       NEW.agent_note   IS DISTINCT FROM OLD.agent_note   OR
       NEW.generated_at IS DISTINCT FROM OLD.generated_at OR
       NEW.review_note  IS DISTINCT FROM OLD.review_note  OR
       NEW.reviewed_at  IS DISTINCT FROM OLD.reviewed_at  OR
       (NEW.reviewed_by IS NOT NULL AND NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by) OR
       (NEW.article_id  IS NOT NULL AND NEW.article_id  IS DISTINCT FROM OLD.article_id)
     ) THEN
    RAISE EXCEPTION 'hasil AI % sudah diputuskan (%), tidak bisa diubah', OLD.id, OLD.status
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_generated_articles_guard BEFORE UPDATE ON generated_articles
  FOR EACH ROW EXECUTE FUNCTION generated_articles_guard();
