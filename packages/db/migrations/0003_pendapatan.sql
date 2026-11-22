-- =====================================================================
-- 0003_pendapatan.sql  -  Dashboard pendapatan multi-sumber (ADR-011).
--
-- Satu ledger terpadu untuk semua pemasukan, dari lima jalur:
--   webhook     push event pembayaran (Lynk.id)
--   api         pull laporan terjadwal (Adsterra, Google AdSense)
--   csv_import  impor file CSV / Excel / JSON
--   headless    otomasi browser (opsional, nonaktif secara bawaan)
--   manual      input manual dan adjustment
--
--   revenue_properties        situs/web penghasil pendapatan, termasuk
--                             yang tidak dilayani framework ini
--   revenue_sources           master sumber (lynk, adsterra, adsense, ...)
--   revenue_fx_rates          kurs ke mata uang utama dashboard
--   revenue_sync_runs         log tarikan API / headless
--   revenue_import_batches    log impor file (+ baris hasil parse)
--   revenue_webhook_events    log setiap webhook masuk
--   revenue_ledger_entries    ledger terpadu; unik (source, idempotency_key)
--   revenue_ledger_revisions  jejak nilai lama setiap kali angka berubah
--
-- Kredensial (API token, OAuth secret, merchant key) TIDAK disimpan di
-- database: credentials_env hanya menyebut awalan nama env var di server.
-- Data pendapatan bersifat global (tanpa site_id); hanya superadmin yang
-- boleh membacanya (diperiksa di aplikasi).
-- =====================================================================

-- ---------- situs penghasil pendapatan -----------------------------
CREATE TABLE revenue_properties (
  id          uuid        PRIMARY KEY DEFAULT uuidv7(),
  code        text        NOT NULL,
  name        text        NOT NULL,
  domain      text,                              -- host tanpa skema, huruf kecil, tanpa www.
  -- Site framework ini bila situsnya dilayani di sini. Bukan site_id:
  -- properti tidak dimiliki satu site (konvensi site_id = milik site).
  linked_site_id uuid     REFERENCES sites (id) ON DELETE SET NULL,
  status      text        NOT NULL DEFAULT 'ACTIVE',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT revenue_properties_code_format CHECK (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(code) <= 50),
  CONSTRAINT revenue_properties_name_length CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT revenue_properties_domain_format
             CHECK (domain IS NULL OR (domain = lower(domain) AND domain ~ '^[a-z0-9.-]+$' AND domain !~ '^www\.' AND length(domain) <= 253)),
  CONSTRAINT revenue_properties_status_valid CHECK (status IN ('ACTIVE', 'ARCHIVED'))
);
CREATE UNIQUE INDEX uq_revenue_properties_code   ON revenue_properties (code);
CREATE UNIQUE INDEX uq_revenue_properties_domain ON revenue_properties (domain) WHERE domain IS NOT NULL;

CREATE TRIGGER trg_revenue_properties_updated_at BEFORE UPDATE ON revenue_properties
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- master sumber pendapatan --------------------------------
-- connector: adapter di packages/core/src/revenue/adapters.
--   lynk / adsterra / adsense : adapter khusus
--   headless                  : runner otomasi browser (opsional)
--   generic                   : hanya impor file dan input manual
-- integration_type: jalur utama sumber ini (untuk tampilan dan filter).
CREATE TABLE revenue_sources (
  id                     uuid        PRIMARY KEY DEFAULT uuidv7(),
  code                   text        NOT NULL,
  name                   text        NOT NULL,
  connector              text        NOT NULL DEFAULT 'generic',
  integration_type       text        NOT NULL DEFAULT 'manual',
  is_active              boolean     NOT NULL DEFAULT true,
  default_currency       text        NOT NULL DEFAULT 'IDR',
  config                 jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- non-rahasia saja
  credentials_env        text,                          -- awalan env var, mis. REVENUE_ADSTERRA
  sync_interval_minutes  integer,                       -- NULL = tanpa jadwal
  lookback_days          smallint    NOT NULL DEFAULT 3,
  sort_order             smallint    NOT NULL DEFAULT 0, -- urutan tampil = urutan warna seri
  last_sync_at           timestamptz,
  last_sync_status       text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT revenue_sources_code_format     CHECK (code ~ '^[a-z0-9]+(_[a-z0-9]+)*$' AND length(code) <= 40),
  CONSTRAINT revenue_sources_name_length     CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT revenue_sources_connector_valid CHECK (connector IN ('lynk', 'adsterra', 'adsense', 'headless', 'generic')),
  CONSTRAINT revenue_sources_type_valid      CHECK (integration_type IN ('webhook', 'api', 'csv_import', 'headless', 'manual')),
  CONSTRAINT revenue_sources_currency_format CHECK (default_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT revenue_sources_config_object   CHECK (jsonb_typeof(config) = 'object'),
  CONSTRAINT revenue_sources_credentials_env CHECK (credentials_env IS NULL OR credentials_env ~ '^[A-Z][A-Z0-9_]{1,60}$'),
  CONSTRAINT revenue_sources_interval_range  CHECK (sync_interval_minutes IS NULL OR sync_interval_minutes BETWEEN 15 AND 10080),
  CONSTRAINT revenue_sources_lookback_range  CHECK (lookback_days BETWEEN 0 AND 60),
  CONSTRAINT revenue_sources_sync_status     CHECK (last_sync_status IS NULL OR last_sync_status IN ('success', 'partial', 'failed'))
);
CREATE UNIQUE INDEX uq_revenue_sources_code ON revenue_sources (code);

CREATE TRIGGER trg_revenue_sources_updated_at BEFORE UPDATE ON revenue_sources
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- kurs ------------------------------------------------------
-- 1 <currency> = rate_to_base <base_currency>, berlaku mulai rate_date
-- sampai ada kurs lebih baru. Entri memakai kurs terakhir <= report_date.
CREATE TABLE revenue_fx_rates (
  currency       text           NOT NULL,
  base_currency  text           NOT NULL,
  rate_date      date           NOT NULL,
  rate_to_base   numeric(20,8)  NOT NULL,
  note           text,
  created_by     uuid           REFERENCES users (id) ON DELETE SET NULL,
  created_at     timestamptz    NOT NULL DEFAULT now(),
  updated_at     timestamptz    NOT NULL DEFAULT now(),
  PRIMARY KEY (currency, base_currency, rate_date),
  CONSTRAINT revenue_fx_rates_currency_format CHECK (currency ~ '^[A-Z]{3}$' AND base_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT revenue_fx_rates_not_same        CHECK (currency <> base_currency),
  CONSTRAINT revenue_fx_rates_positive        CHECK (rate_to_base > 0)
);

CREATE TRIGGER trg_revenue_fx_rates_updated_at BEFORE UPDATE ON revenue_fx_rates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- log tarikan API / headless -------------------------------
CREATE TABLE revenue_sync_runs (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  source_id       uuid        NOT NULL REFERENCES revenue_sources (id) ON DELETE CASCADE,
  channel_type    text        NOT NULL,
  trigger         text        NOT NULL,
  status          text        NOT NULL DEFAULT 'running',
  mock            boolean     NOT NULL DEFAULT false,
  range_start     date        NOT NULL,
  range_end       date        NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  rows_fetched    integer     NOT NULL DEFAULT 0,
  inserted        integer     NOT NULL DEFAULT 0,
  updated         integer     NOT NULL DEFAULT 0,
  unchanged       integer     NOT NULL DEFAULT 0,
  skipped         integer     NOT NULL DEFAULT 0,
  failed          integer     NOT NULL DEFAULT 0,
  error_message   text,
  log             jsonb       NOT NULL DEFAULT '[]'::jsonb,
  triggered_by    uuid        REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT revenue_sync_runs_channel_valid CHECK (channel_type IN ('api', 'headless')),
  CONSTRAINT revenue_sync_runs_trigger_valid CHECK (trigger IN ('schedule', 'manual', 'cli')),
  CONSTRAINT revenue_sync_runs_status_valid  CHECK (status IN ('running', 'success', 'partial', 'failed')),
  CONSTRAINT revenue_sync_runs_range_valid   CHECK (range_start <= range_end),
  CONSTRAINT revenue_sync_runs_finished      CHECK ((status = 'running') = (finished_at IS NULL)),
  CONSTRAINT revenue_sync_runs_log_array     CHECK (jsonb_typeof(log) = 'array')
);
CREATE INDEX idx_revenue_sync_runs_source ON revenue_sync_runs (source_id, started_at DESC);
-- Paling banyak satu tarikan berjalan per sumber (jadwal dan tombol manual tidak bertabrakan).
CREATE UNIQUE INDEX uq_revenue_sync_runs_running ON revenue_sync_runs (source_id) WHERE status = 'running';

-- ---------- log impor file ------------------------------------------
-- rows: hasil parse file (array object kolom -> teks), disimpan sampai
-- impor di-commit atau dibuang, agar preview dan commit memakai data yang
-- sama tanpa mengunggah ulang.
CREATE TABLE revenue_import_batches (
  id            uuid        PRIMARY KEY DEFAULT uuidv7(),
  source_id     uuid        NOT NULL REFERENCES revenue_sources (id) ON DELETE CASCADE,
  file_name     text        NOT NULL,
  file_format   text        NOT NULL,
  file_sha256   text        NOT NULL,
  status        text        NOT NULL DEFAULT 'uploaded',
  row_count     integer     NOT NULL DEFAULT 0,
  headers       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  rows          jsonb,
  mapping       jsonb,
  inserted      integer     NOT NULL DEFAULT 0,
  updated       integer     NOT NULL DEFAULT 0,
  unchanged     integer     NOT NULL DEFAULT 0,
  skipped       integer     NOT NULL DEFAULT 0,
  failed        integer     NOT NULL DEFAULT 0,
  errors        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_by    uuid        REFERENCES users (id) ON DELETE SET NULL,
  committed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT revenue_import_batches_format_valid CHECK (file_format IN ('csv', 'xlsx', 'json')),
  CONSTRAINT revenue_import_batches_status_valid CHECK (status IN ('uploaded', 'committed', 'failed', 'discarded')),
  CONSTRAINT revenue_import_batches_name_length  CHECK (length(file_name) BETWEEN 1 AND 255),
  CONSTRAINT revenue_import_batches_committed    CHECK ((status = 'committed') = (committed_at IS NOT NULL)),
  CONSTRAINT revenue_import_batches_rows_pending CHECK (status = 'uploaded' OR rows IS NULL)
);
CREATE INDEX idx_revenue_import_batches_source ON revenue_import_batches (source_id, created_at DESC);

CREATE TRIGGER trg_revenue_import_batches_updated_at BEFORE UPDATE ON revenue_import_batches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- log webhook masuk ---------------------------------------
-- Payload hanya disimpan bila tanda tangan sah (request palsu tidak
-- mengisi database dengan data sembarang).
CREATE TABLE revenue_webhook_events (
  id                 uuid        PRIMARY KEY DEFAULT uuidv7(),
  source_id          uuid        NOT NULL REFERENCES revenue_sources (id) ON DELETE CASCADE,
  received_at        timestamptz NOT NULL DEFAULT now(),
  event_type         text,
  external_event_id  text,
  signature_valid    boolean     NOT NULL,
  status             text        NOT NULL,
  ledger_entry_id    uuid,                              -- FK ditambahkan setelah tabel ledger
  error              text,
  payload            jsonb,
  test               boolean     NOT NULL DEFAULT false,  -- dikirim tombol uji di admin
  CONSTRAINT revenue_webhook_events_status_valid CHECK (status IN ('processed', 'duplicate', 'ignored', 'rejected', 'failed')),
  CONSTRAINT revenue_webhook_events_payload_signed CHECK (payload IS NULL OR signature_valid)
);
CREATE INDEX idx_revenue_webhook_events_source ON revenue_webhook_events (source_id, received_at DESC);

-- ---------- ledger terpadu ------------------------------------------
-- status:
--   estimated  angka sementara (hari berjalan, laporan belum final)
--   finalized  angka final dari sumber
--   adjusted   koreksi manual (boleh negatif), wajib alasan
--   refunded   pengembalian dana (negatif), wajib alasan
-- normalized_amount = round(gross_amount * fx_rate_to_base, 2) dalam
-- base_currency; NULL bila kurs belum tersedia (tampil sebagai peringatan).
CREATE TABLE revenue_ledger_entries (
  id                 uuid           PRIMARY KEY DEFAULT uuidv7(),
  source_id          uuid           NOT NULL REFERENCES revenue_sources (id) ON DELETE RESTRICT,
  property_id        uuid           REFERENCES revenue_properties (id) ON DELETE SET NULL,
  channel_type       text           NOT NULL,
  idempotency_key    text           NOT NULL,
  external_id        text,
  occurred_at        timestamptz,
  report_date        date           NOT NULL,
  gross_amount       numeric(20,6)  NOT NULL,
  currency           text           NOT NULL,
  fx_rate_to_base    numeric(20,8),
  base_currency      text           NOT NULL,
  normalized_amount  numeric(20,2),
  status             text           NOT NULL,
  metrics_json       jsonb          NOT NULL DEFAULT '{}'::jsonb,
  dimensions         jsonb          NOT NULL DEFAULT '{}'::jsonb,
  description        text,
  note               text,                              -- alasan / catatan audit
  raw_payload        jsonb,
  adjusts_entry_id   uuid           REFERENCES revenue_ledger_entries (id) ON DELETE SET NULL,
  sync_run_id        uuid           REFERENCES revenue_sync_runs (id) ON DELETE SET NULL,
  import_batch_id    uuid           REFERENCES revenue_import_batches (id) ON DELETE SET NULL,
  webhook_event_id   uuid           REFERENCES revenue_webhook_events (id) ON DELETE SET NULL,
  created_by         uuid           REFERENCES users (id) ON DELETE SET NULL,
  revision           integer        NOT NULL DEFAULT 1,
  created_at         timestamptz    NOT NULL DEFAULT now(),
  updated_at         timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT revenue_ledger_channel_valid   CHECK (channel_type IN ('webhook', 'api', 'csv_import', 'headless', 'manual')),
  CONSTRAINT revenue_ledger_status_valid    CHECK (status IN ('estimated', 'finalized', 'adjusted', 'refunded')),
  CONSTRAINT revenue_ledger_key_length      CHECK (length(idempotency_key) BETWEEN 1 AND 300),
  CONSTRAINT revenue_ledger_currency_format CHECK (currency ~ '^[A-Z]{3}$' AND base_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT revenue_ledger_fx_pair         CHECK ((fx_rate_to_base IS NULL) = (normalized_amount IS NULL)),
  CONSTRAINT revenue_ledger_fx_positive     CHECK (fx_rate_to_base IS NULL OR fx_rate_to_base > 0),
  CONSTRAINT revenue_ledger_fx_same_ccy     CHECK (currency <> base_currency OR fx_rate_to_base = 1),
  CONSTRAINT revenue_ledger_metrics_object  CHECK (jsonb_typeof(metrics_json) = 'object' AND jsonb_typeof(dimensions) = 'object'),
  CONSTRAINT revenue_ledger_note_required   CHECK (status NOT IN ('adjusted', 'refunded') OR length(btrim(coalesce(note, ''))) > 0),
  CONSTRAINT revenue_ledger_refund_negative CHECK (status <> 'refunded' OR gross_amount < 0),
  CONSTRAINT revenue_ledger_description_len CHECK (description IS NULL OR length(description) <= 500),
  CONSTRAINT revenue_ledger_note_len        CHECK (note IS NULL OR length(note) <= 2000),
  CONSTRAINT revenue_ledger_revision_pos    CHECK (revision >= 1)
);
CREATE UNIQUE INDEX uq_revenue_ledger_key      ON revenue_ledger_entries (source_id, idempotency_key);
CREATE INDEX idx_revenue_ledger_date           ON revenue_ledger_entries (report_date);
CREATE INDEX idx_revenue_ledger_source_date    ON revenue_ledger_entries (source_id, report_date);
CREATE INDEX idx_revenue_ledger_property_date  ON revenue_ledger_entries (property_id, report_date);
CREATE INDEX idx_revenue_ledger_recent         ON revenue_ledger_entries (updated_at DESC);
CREATE INDEX idx_revenue_ledger_unconverted    ON revenue_ledger_entries (currency, report_date) WHERE normalized_amount IS NULL;

ALTER TABLE revenue_webhook_events
  ADD CONSTRAINT fk_revenue_webhook_events_entry FOREIGN KEY (ledger_entry_id)
      REFERENCES revenue_ledger_entries (id) ON DELETE SET NULL;

CREATE TABLE revenue_ledger_revisions (
  id                 uuid           PRIMARY KEY DEFAULT uuidv7(),
  entry_id           uuid           NOT NULL REFERENCES revenue_ledger_entries (id) ON DELETE CASCADE,
  revision           integer        NOT NULL,
  gross_amount       numeric(20,6)  NOT NULL,
  currency           text           NOT NULL,
  fx_rate_to_base    numeric(20,8),
  normalized_amount  numeric(20,2),
  status             text           NOT NULL,
  metrics_json       jsonb          NOT NULL,
  sync_run_id        uuid,
  import_batch_id    uuid,
  replaced_at        timestamptz    NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_revenue_ledger_revisions ON revenue_ledger_revisions (entry_id, revision);

-- Jejak audit ledger, ditegakkan database (berlaku untuk semua jalur):
--  - identitas entri (sumber, kunci, jalur, mata uang utama) tidak bisa diubah;
--  - angka final tidak bisa turun kembali menjadi sementara;
--  - setiap perubahan angka/status/metrik menyimpan versi lama ke
--    revenue_ledger_revisions dan menaikkan revision. Mengisi kurs yang
--    tadinya kosong bukan revisi (angka sumber tidak berubah).
CREATE FUNCTION revenue_ledger_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source_id       IS DISTINCT FROM OLD.source_id OR
     NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR
     NEW.channel_type    IS DISTINCT FROM OLD.channel_type OR
     NEW.base_currency   IS DISTINCT FROM OLD.base_currency THEN
    RAISE EXCEPTION 'identitas entri ledger % tidak bisa diubah', OLD.id USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status = 'finalized' AND NEW.status = 'estimated' THEN
    RAISE EXCEPTION 'entri ledger % sudah final, tidak bisa kembali sementara', OLD.id USING ERRCODE = 'P0001';
  END IF;
  IF NEW.gross_amount IS DISTINCT FROM OLD.gross_amount OR
     NEW.currency     IS DISTINCT FROM OLD.currency OR
     NEW.status       IS DISTINCT FROM OLD.status OR
     NEW.metrics_json IS DISTINCT FROM OLD.metrics_json OR
     (OLD.fx_rate_to_base IS NOT NULL AND NEW.fx_rate_to_base IS DISTINCT FROM OLD.fx_rate_to_base) THEN
    INSERT INTO revenue_ledger_revisions
      (entry_id, revision, gross_amount, currency, fx_rate_to_base, normalized_amount, status, metrics_json, sync_run_id, import_batch_id)
    VALUES
      (OLD.id, OLD.revision, OLD.gross_amount, OLD.currency, OLD.fx_rate_to_base, OLD.normalized_amount, OLD.status, OLD.metrics_json, OLD.sync_run_id, OLD.import_batch_id);
    NEW.revision := OLD.revision + 1;
  ELSE
    NEW.revision := OLD.revision;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_revenue_ledger_guard BEFORE UPDATE ON revenue_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION revenue_ledger_guard();

CREATE TRIGGER trg_revenue_ledger_updated_at BEFORE UPDATE ON revenue_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Revisi hanya ditambah (oleh trigger), tidak pernah diubah.
CREATE FUNCTION revenue_ledger_revisions_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'revisi ledger tidak bisa diubah' USING ERRCODE = 'P0001';
END
$$;

CREATE TRIGGER trg_revenue_ledger_revisions_immutable BEFORE UPDATE ON revenue_ledger_revisions
  FOR EACH ROW EXECUTE FUNCTION revenue_ledger_revisions_immutable();

-- ---------- sumber bawaan -------------------------------------------
-- Master data (bukan data contoh): empat sumber yang dipakai pemilik
-- proyek, ditambah satu sumber umum untuk input manual. Semua tanpa
-- kredensial; adapter API memakai mode mock sampai env diisi.
INSERT INTO revenue_sources (code, name, connector, integration_type, default_currency, credentials_env, sync_interval_minutes, lookback_days, sort_order, config) VALUES
  ('adsense',  'Google AdSense', 'adsense',  'api',        'USD', 'REVENUE_ADSENSE',  360, 3, 1, '{"reportingTimeZone": "ACCOUNT_TIME_ZONE", "finalizeDay": 7}'),
  ('adsterra', 'Adsterra',       'adsterra', 'api',        'USD', 'REVENUE_ADSTERRA', 180, 3, 2, '{}'),
  ('lynk',     'Lynk.id',        'lynk',     'webhook',    'IDR', 'REVENUE_LYNK',     NULL, 0, 3, '{"timezone": "Asia/Jakarta"}'),
  ('whop',     'Whop',           'generic',  'csv_import', 'USD', NULL,               NULL, 0, 4, '{}'),
  ('lainnya',  'Lainnya',        'generic',  'manual',     'IDR', NULL,               NULL, 0, 9, '{}');
