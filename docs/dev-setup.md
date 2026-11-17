# Setup development

Stack lokal berjalan lewat Docker Compose: PostgreSQL 18.7, service sekali-jalan untuk migration
dan seed, service test, dan Adminer sebagai UI (User Interface) database opsional. Aplikasi Nuxt
dijalankan di host dengan `pnpm dev`, bukan di container, agar hot reload cepat.

## Pertama kali

1. `cp .env.example .env`, lalu ganti `POSTGRES_PASSWORD` dan `APP_DB_PASSWORD`.
   Samakan password di `DATABASE_URL` dengan `APP_DB_PASSWORD`.
2. `docker compose up -d`
3. `docker compose logs db-migrate` harus berakhir dengan `database blog_dev siap`.
4. `docker compose --profile test run --rm db-test` harus berakhir dengan
   `SELESAI: semua pemeriksaan lulus` (50 pemeriksaan).

## Perintah sehari-hari

| Kebutuhan | Perintah |
| --- | --- |
| Menyalakan database | `docker compose up -d` |
| Menjalankan migration baru + seed | `docker compose run --rm db-migrate` |
| Uji lengkap `packages/db` | `docker compose --profile test run --rm db-test` |
| Membuka Adminer | `docker compose --profile tools up -d adminer` → http://localhost:8080 (System: PostgreSQL, Server: `db`) |
| Masuk psql | `docker compose exec db psql -U blog -d blog_dev` |
| Melihat query lambat (> 250 ms) | `docker compose logs -f db` |
| Mematikan (data tetap) | `docker compose down` |
| Mengulang dari nol (data dev hilang) | `docker compose down -v && docker compose up -d` |

## Dua role database

| Role | Dipakai oleh | Hak |
| --- | --- | --- |
| `POSTGRES_USER` (`blog`) | Migration, test, Adminer | Pemilik schema, superuser di container dev |
| `APP_DB_USER` (`blog_app`) | Aplikasi Nuxt lewat `DATABASE_URL` | Hanya SELECT/INSERT/UPDATE/DELETE; tanpa DDL (Data Definition Language), tanpa akses `schema_migrations` |

Pemisahan ini sudah berlaku sejak awal agar RLS (Row-Level Security) bisa diaktifkan nanti tanpa
mengubah cara aplikasi terhubung.

## Menambah migration

1. Buat file baru `packages/db/migrations/0002_deskripsi.sql`. Jangan tulis `BEGIN`/`COMMIT`;
   runner membungkus setiap file dalam satu transaksi.
2. `pnpm db:migrate` (= `docker compose run --rm db-migrate`)
3. `pnpm db:pull` untuk membuat ulang schema Drizzle di `packages/db/src/schema/`, lalu
   `pnpm test`.
4. File yang sudah pernah dijalankan tidak boleh diedit. Runner menyimpan checksum dan akan
   menolak file yang berubah.

## Domain lokal (dipakai mulai M2)

Tambahkan ke `/etc/hosts` (Windows: `C:\Windows\System32\drivers\etc\hosts`):

```
127.0.0.1  tekno.local.test www.tekno.local.test kuliner.local.test
```

## Catatan penting

- **Password di `.env` hanya dibaca saat volume pertama kali dibuat.** Mengubahnya setelah itu
  tidak mengganti password role `blog`; pakai `docker compose down -v` (data dev hilang) atau
  `ALTER ROLE`. Password `blog_app` selalu disinkronkan oleh `db-migrate`.
- **Volume PostgreSQL 18 dipasang di `/var/lib/postgresql`**, bukan `/var/lib/postgresql/data`
  seperti panduan lama untuk versi 17 ke bawah.
- **Upgrade minor** (mis. 18.7 → 18.8): ganti tag image lalu `docker compose up -d`.
  **Upgrade mayor** (18 → 19) butuh `pg_upgrade` atau dump/restore; jangan hanya mengganti tag.
- Port database dan Adminer hanya dibuka ke `127.0.0.1`, tidak ke jaringan lain.
- Waktu server di-set UTC (Coordinated Universal Time); konversi zona waktu dilakukan aplikasi.
- Compose ini khusus development. Compose produksi (tanpa seed, tanpa Adminer, dengan backup)
  dibuat di M5.
