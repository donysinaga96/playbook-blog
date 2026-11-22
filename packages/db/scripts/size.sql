-- Ukuran database dan tabel terbesar (M5 5.5). Dipanggil `pnpm db:size`.
\pset footer off
SELECT current_database() AS database, pg_size_pretty(pg_database_size(current_database())) AS ukuran;
SELECT c.relname AS tabel,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS total,
       pg_size_pretty(pg_relation_size(c.oid))       AS data,
       pg_size_pretty(pg_indexes_size(c.oid))        AS index,
       c.reltuples::bigint                            AS perkiraan_baris
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r'
 ORDER BY pg_total_relation_size(c.oid) DESC
 LIMIT 20;
