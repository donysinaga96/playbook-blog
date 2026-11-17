# ADR-003: Migration ditulis SQL tangan

- Status: Diterima
- Tanggal: 2026-11-17

## Konteks

Integritas multi-site dijaga oleh database: composite FK, partial unique index, CHECK
constraint, `ON DELETE SET NULL (kolom)`, generated column untuk pencarian, dan trigger.
Generator migration ORM tidak selalu menghasilkan fitur ini dengan benar, dan hasilnya sulit
diaudit.

## Keputusan

- Migration ditulis SQL di `packages/db/migrations/NNNN_deskripsi.sql`, tanpa `BEGIN`/`COMMIT`.
- Runner `packages/db/scripts/migrate.sh` menjalankan file berurutan, satu transaksi per file,
  dan menyimpan checksum di `schema_migrations`.
- Migration append-only: file yang sudah dijalankan di luar laptop tidak diedit; perubahan
  ditulis di file baru. Runner menolak file yang checksum-nya berubah.
- Aplikasi terhubung sebagai `blog_app` (hanya DML), bukan pemilik schema.

## Alternatif yang ditolak

- **drizzle-kit generate/migrate.** Database menjadi turunan kode TypeScript, padahal di sini
  database adalah kontrak produk.
- **Tool migration terpisah (Flyway, dbmate, sqitch).** Runner shell sekitar 80 baris sudah
  cukup dan tidak menambah dependency.

## Konsekuensi

- Schema Drizzle dibuat dari database (`drizzle-kit pull`), lalu dicek: composite FK dan
  partial index harus terbaca benar.
- Setiap aturan baru di database butuh test di `packages/db/tests/integrity_test.sql`.
- `run_all.sh` (50 pemeriksaan) dijalankan di CI terhadap PostgreSQL 18.
