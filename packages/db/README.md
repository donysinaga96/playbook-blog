# packages/db

Schema database framework web artikel multi-site / multi-template.

```
migrations/0001_core.sql    schema v1: 16 tabel, constraint, index, trigger (tanpa BEGIN/COMMIT)
seed/dev_seed.sql           2 site contoh dengan topik & template berbeda (idempotent)
tests/integrity_test.sql    42 test integritas + pemakaian index (di-ROLLBACK)
scripts/migrate.sh          runner migration: urut, satu transaksi per file, checksum di schema_migrations
scripts/app_role.sql/.sh    role aplikasi (DML saja, tanpa DDL, tanpa BYPASSRLS)
scripts/seed.sh             menjalankan seed/*.sql
scripts/setup.sh            migrate -> app_role -> seed (entry point service db-migrate)
run_all.sh                  uji lengkap: 50 pemeriksaan pada database baru
```

## Menjalankan

Lewat Docker (disarankan, lihat `docs/dev-setup.md`):

```bash
docker compose up -d                              # migrate + role + seed
docker compose --profile test run --rm db-test    # uji lengkap
```

Tanpa Docker, cukup `psql`, `createdb`, `dropdb` dan variabel libpq:

```bash
export PGHOST=localhost PGUSER=blog PGPASSWORD=... PGDATABASE=blog_dev
sh scripts/migrate.sh
./run_all.sh blog_framework_test
```

Target PostgreSQL 18 (`uuidv7()` bawaan). PostgreSQL 15–17 jalan lewat shim di bagian 0 migration.

## Aturan

1. Tabel milik site punya `site_id NOT NULL`; relasi antar tabel milik site memakai composite FK
   `(site_id, x_id) -> (site_id, id)`, jadi relasi lintas site ditolak database.
2. Status = `text` + `CHECK`, bukan ENUM.
3. Migration append-only: file yang sudah dijalankan tidak diedit. Perubahan = file baru
   `NNNN_deskripsi.sql`, tanpa `BEGIN`/`COMMIT`.
4. Aplikasi terhubung sebagai `APP_DB_USER`, bukan pemilik schema.
