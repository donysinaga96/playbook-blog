-- =====================================================================
-- app_role.sql  -  Role database untuk aplikasi (Nuxt server).
--
-- Migration dijalankan oleh pemilik schema (POSTGRES_USER). Aplikasi
-- login sebagai role terpisah yang hanya boleh baca/tulis data:
-- tidak boleh DDL, bukan superuser, tanpa BYPASSRLS. Ini prasyarat
-- RLS di kemudian hari, dan membatasi dampak bila aplikasi bocor.
--
-- Idempotent. Dipanggil oleh scripts/app_role.sh dengan variabel psql:
--   -v app_user=...  -v app_password=...
-- =====================================================================

SELECT format('CREATE ROLE %I LOGIN', :'app_user')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user')
\gexec

SELECT format('ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L',
              :'app_user', :'app_password')
\gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'app_user')
\gexec

GRANT USAGE ON SCHEMA public TO :"app_user";

-- Tabel & sequence yang sudah ada ...
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO :"app_user";
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO :"app_user";

-- ... dan yang dibuat migration berikutnya oleh role yang sama.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";

-- Catatan migration hanya urusan runner.
REVOKE ALL ON TABLE schema_migrations FROM :"app_user";
