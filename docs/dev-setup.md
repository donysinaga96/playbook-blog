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
| Menjalankan aplikasi web (hot reload) | `pnpm dev` → http://tekno.localhost:3000 (lihat "Domain site di dev"), cek `/api/health` |
| Build produksi lalu menjalankannya | `pnpm build`, lalu `pnpm --filter @framework/web preview` |
| Smoke test hasil build (server start, `/api/health` = 200) | `pnpm build`, lalu `pnpm --filter @framework/web smoke` |
| Cek hidrasi + screenshot di browser (lokal, butuh `pnpm dev` jalan) | `pnpm --filter @framework/web browser-check` (lihat "Cek di browser") |
| Gate M2: request paralel ke dua domain tidak tertukar | `pnpm build`, lalu `pnpm --filter @framework/web gate` |
| Memperbarui snapshot view model (setelah perubahan yang disengaja) | `pnpm vitest run packages/core/src/views -u`, lalu periksa diff `.snap` |

## Aplikasi web

`apps/web` (Nuxt 4.6) berjalan di host, bukan di container. `pnpm dev` membaca `.env` di root
repo (`nuxt dev --dotenv ../../.env`), jadi `DATABASE_URL` cukup ditulis sekali di sana.
`GET /api/health` mengembalikan `{"status":"ok","database":"ok"}` bila database bisa dihubungi,
atau HTTP 503 bila tidak. Folder `.nuxt/` dibuat ulang otomatis oleh `nuxt prepare` setiap
`pnpm install`.

Job CI `build` menjalankan `pnpm build` lalu smoke test yang sama, tetapi tanpa database
(`EXPECT_STATUS=503`): server harus start dan menjawab 503, bukan crash. Hasil build
(`apps/web/.output/`) disimpan sebagai artifact selama satu minggu.

## Domain site di dev

Setiap request dipetakan ke site lewat header `Host` (`SITE_MODE=multi` di `.env`). Host yang
tidak terdaftar di `site_domains` dijawab 404, termasuk `localhost`. Hanya `/api/health` yang
tidak butuh site. Domain dari seed:

| Domain | Site | Perilaku |
| --- | --- | --- |
| `tekno.localhost` | Kabar Tekno | Dilayani |
| `www.tekno.localhost` | Kabar Tekno | 301 ke `tekno.localhost` (alias) |
| `kuliner.localhost` | Dapur Nusantara | Dilayani |

Domain berakhiran `.localhost` selalu mengarah ke komputer sendiri: Chrome, Edge, dan Firefox
menjawabnya tanpa DNS dan tanpa file hosts, jadi tidak perlu hak Administrator. Setelah
`pnpm dev`, langsung buka http://tekno.localhost:3000 atau http://kuliner.localhost:3000 (ketik
lengkap dengan `http://`). Di WSL, browser Windows sampai ke server WSL lewat
`networkingMode=mirrored` di `.wslconfig`.

Dari terminal, kirim header Host dengan curl:

```bash
curl -H 'Host: kuliner.localhost' http://127.0.0.1:3000/
```

Dev server Vite secara bawaan hanya mengizinkan `localhost`, subdomain `.localhost`, dan alamat
IP; Host lain mendapat 403 `Blocked request` sebelum sampai ke middleware. Karena itu domain dev
memakai `.localhost`. Di server produksi, Host yang tidak terdaftar mendapat 404.

Mode single-site: `SITE_MODE=single` dan `SITE_CODE=<sites.code>`. Domain tetap dicek, jadi
domain milik site lain di database yang sama dijawab 404. Config yang salah (mis. `SITE_MODE`
kosong, atau `SITE_CODE` diisi saat `multi`) membuat server gagal start dengan pesan
`SiteModeConfigError` yang menyebut variabel bermasalah.


`pnpm dev` hanya mendengarkan di `localhost` (`--host localhost`): dev server menyajikan source
code tanpa autentikasi, jadi tidak dibuka ke jaringan. Browser Windows di WSL tetap bisa
membukanya karena WSL meneruskan `localhost`.

## Halaman publik

Skema URL ada di [ADR-006](adr/006-skema-url.md); halaman dirender penuh di server
([ADR-007](adr/007-render-halaman-server.md)). Contoh di data seed:

| Halaman | Contoh |
| --- | --- |
| Home | http://tekno.localhost:3000/ |
| Artikel (`settings.permalink`) | http://tekno.localhost:3000/review/ponsel-lipat-makin-murah |
| Kategori | http://tekno.localhost:3000/category/gadget |
| Tag, penulis | http://tekno.localhost:3000/tag/android, http://tekno.localhost:3000/author/budi-santoso |
| Halaman statis | http://kuliner.localhost:3000/p/kontak |
| Pencarian | http://tekno.localhost:3000/search?q=ponsel |
| Redirect lama (tabel `redirects`) | http://tekno.localhost:3000/gadget/ponsel-lipat-murah → 301 |

View model dibangun di `server/middleware/site.ts` lewat `createPageBuilder` (`packages/core`),
lalu disalin ke state Vue. Block body yang dilewati atau media yang hilang dicatat di log server:
`[page] site <kode> <path>: ...`.

## SEO dan feed

- `<head>` setiap halaman diisi dari `page.seo` (dibangun `packages/core/src/views/seo.ts`):
  title lewat `settings.seo.titleTemplate`, description, canonical, robots, Open Graph, tautan RSS.
- URL absolut (canonical, `og:url`, sitemap, RSS) selalu di domain **primary** site. Skema
  (`http`/`https`) diambil dari request atau header `X-Forwarded-Proto`, jadi reverse proxy TLS di
  produksi wajib mengirim header itu.
- Kolom `seo` di artikel, halaman, dan kategori (`title`, `description`, `canonical`,
  `og_image_id`, `robots`) menimpa nilai otomatis; nilai yang tidak valid diabaikan per key.
- Pencarian dan 404 diberi `noindex, follow`; `robots.txt` juga melarang crawl `/search` dan
  `/api/`.
- Feed per domain: http://tekno.localhost:3000/sitemap.xml, `/rss.xml` (20 artikel terbaru),
  `/robots.txt`. Artikel terjadwal baru muncul setelah `published_at` lewat. Tag dan penulis
  tanpa artikel tampil tidak masuk sitemap.
- Embed YouTube memakai `youtube-nocookie.com`, Vimeo memakai `dnt=1`. X tampil sebagai tautan
  (embed X butuh script widget mereka).

## Template dan theme

- Setiap request halaman memuat baris aktif `site_themes`, lalu registry manifest di
  `apps/web/server/utils/templates.ts` memilih template berdasarkan `template_key` dan
  memvalidasi token, opsi, serta layout section (ADR-008). Template yang tidak terdaftar jatuh
  ke `base`. Seed: kabar-tekno memakai `magazine`, dapur-nusantara memakai `news`.
- Layout home diambil dari `site_themes.layouts.home`; section yang rusak dilewati, layout
  kosong atau rusak memakai `defaultLayouts` template.
- Token dan opsi divalidasi per key terhadap skema manifest; nilai yang salah memakai default.
- Masalah theme (template tidak terdaftar, nilai tidak valid, key tidak dikenal) dicatat sekali
  per proses di log server: `[theme] site <kode>: ...`.
- Halaman dibungkus `<div class="tpl tpl-<key>">`. Token menjadi CSS variable di
  `<style data-hid="theme-tokens">` di `<head>`.
- Font (Inter, Merriweather, Source Sans 3) di-self-host dari paket `@fontsource`. File woff2 ikut
  di-bundle ke `/_nuxt/`, tanpa CDN pihak ketiga.
- Kode di `apps/web/app/` (Vue) hanya boleh import **tipe** dari `@framework/core` dan
  `@framework/db` (dijaga ESLint). Entry core membawa driver `pg`, yang rusak bila ikut ke bundle
  SSR Vue. Fungsi murni tersedia lewat subpath, mis. `@framework/core/media`.

## Cek di browser

`apps/web/scripts/browser-check.mjs` membuka 12 halaman kedua site di Chromium headless
(Playwright), di lebar desktop dan ponsel, terhadap `pnpm dev` yang sedang jalan. Halaman gagal
bila tidak ter-hydrate, ada peringatan hydration mismatch, page error, atau console error.
Screenshot full page disimpan di `apps/web/.browser-check/` (tidak masuk Git). Skrip ini tidak
dijalankan di CI.

1. Sekali saja: `pnpm --filter @framework/web exec playwright install chromium`.
2. Jalankan `pnpm dev`, lalu di terminal lain `pnpm --filter @framework/web browser-check`.
   Variabel opsional: `BASE_URL` (default `http://{host}:3000`), `SHOTS_DIR`.

Bila Chromium gagal start karena library sistem tidak ada (`libnss3.so`, `libnspr4.so`,
`libasound.so.2`) dan tidak ada akses sudo untuk `playwright install-deps`, ekstrak paketnya ke
folder sendiri lalu arahkan `BROWSER_LIB_DIR` ke sana:

```bash
mkdir -p ~/.local/chromium-libs && cd ~/.local/chromium-libs
apt-get download libnss3 libnspr4 libasound2t64   # Ubuntu 22.04 / Debian 12: libasound2
for f in *.deb; do dpkg-deb -x "$f" root; done
BROWSER_LIB_DIR=~/.local/chromium-libs/root/usr/lib/x86_64-linux-gnu \
  pnpm --filter @framework/web browser-check
```

## Media

`GET /media/<storage_key>` menyajikan file dari `MEDIA_DIR` (lihat `.env.example`):

- Hanya media milik site request itu: `storage_key` harus diawali kode site.
- Di dev, file yang tidak ada diganti placeholder SVG abu-abu bertuliskan nama file. Media seed
  jadi tampil tanpa menyimpan gambar di Git.
- Di produksi tanpa file, responsnya 404.

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
