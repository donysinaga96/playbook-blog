-- =====================================================================
-- agent_role.sql  -  Role database untuk AI agent konten (ADR-010).
--
-- Agent dibangun di luar repo ini dan menulis hasil AI langsung ke
-- database. Role ini hanya boleh:
--   - membaca pilihan yang valid: sites, categories, authors, tags
--     (kolom tertentu saja);
--   - membaca generated_articles (status dan alasan penolakan);
--   - menulis kolom isi generated_articles. Kolom status dan keputusan
--     tidak bisa diisi, jadi hasil AI selalu READY_TO_PUBLISH. Trigger
--     generated_articles_guard menolak perubahan hasil yang sudah diputuskan.
-- Tanpa DELETE, tanpa akses ke tabel konten lain. Kontrak: docs/kontrak-agent.md.
--
-- Idempotent. Dipanggil oleh scripts/agent_role.sh dengan variabel psql:
--   -v agent_user=...  -v agent_password=...
-- Password kosong: role dibuat NOLOGIN bila belum ada, dan role yang sudah
-- ada tidak diubah login/password-nya (role berlaku untuk seluruh server;
-- run_all.sh tidak boleh menimpa password agent milik database dev).
-- =====================================================================

SELECT format('CREATE ROLE %I NOLOGIN', :'agent_user')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'agent_user')
\gexec

SELECT format('ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L',
              :'agent_user', :'agent_password')
 WHERE :'agent_password' <> ''
\gexec

SELECT format('ALTER ROLE %I WITH NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS', :'agent_user')
\gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'agent_user')
\gexec

GRANT USAGE ON SCHEMA public TO :"agent_user";

-- Mulai dari nol agar hak yang pernah diberikan lalu dicabut di versi
-- skrip ini benar-benar hilang.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM :"agent_user";
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM :"agent_user";

GRANT SELECT (id, code, name, status)                     ON sites      TO :"agent_user";
GRANT SELECT (id, site_id, parent_id, name, slug, status) ON categories TO :"agent_user";
GRANT SELECT (id, site_id, name, slug, status)            ON authors    TO :"agent_user";
GRANT SELECT (id, site_id, name, slug)                    ON tags       TO :"agent_user";

GRANT SELECT ON generated_articles TO :"agent_user";
GRANT INSERT (site_id, external_id, payload, agent_note, generated_at) ON generated_articles TO :"agent_user";
GRANT UPDATE (payload, agent_note, generated_at)                       ON generated_articles TO :"agent_user";
