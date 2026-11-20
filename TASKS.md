# Task List — Framework Web Artikel Multi-Template

Sumber: Google Doc "Revisi Implementation Guide — Framework Web Artikel Multi-Template" (Drive, folder "Framework Web Artikel Multi-Template").
Diambil dari dokumen pada 19 Nov 2026. Sejak itu file ini menjadi daftar task kerja dan tidak disinkronkan lagi dengan dokumen.

## Ringkasan progres

| Milestone | Task selesai | Gate |
|---|---|---|
| M0 — Fondasi | 10 / 10 | ✅ Lulus 17 Nov 2026 — pipeline #3078334327 (commit 9df99b4) |
| M1 — Database v1 | 12 / 12 | ✅ Lulus 19 Nov 2026 — pipeline hijau (commit fea423a) |
| M2 — Tampilan pertama | 30 / 30 | 🟡 Lulus lokal 19 Nov 2026 — menunggu pipeline CI (belum di-commit) |
| M3 — Template kedua (titik evaluasi) | 0 / 3 | — |
| M4 — Admin minimal | 0 / 5 | — |
| M5 — Produksi pertama (titik evaluasi) | 0 / 4 | — |

**Task berikutnya:** commit M2 dan pastikan pipeline CI hijau (gate M2), lalu merinci M3. Task M3–M5 sengaja masih kasar dan dirinci saat milestone sebelumnya selesai.

Aturan roadmap: setiap fase hanya dimulai setelah gate fase sebelumnya lulus. Urutan M4 dan M5 boleh ditukar pada evaluasi M3. Setelah M3 dan M5 roadmap ditinjau ulang.

---

## M0 — Fondasi

- [x] Tools host: aktifkan pnpm lewat corepack (Node 24 sudah terpasang). psql tidak perlu dipasang di host karena migrate, seed, dan test berjalan di container.
- [x] Buat repository Git dan monorepo pnpm workspace sesuai struktur repository, termasuk script `pnpm db:up`, `db:migrate`, `db:test` yang memanggil Docker Compose
- [x] `tsconfig.base.json` mode strict, dipakai semua package
- [x] Docker Compose: PostgreSQL 18.7, migration + role aplikasi + seed otomatis, service test, Adminer (`docker-compose.yml`, `docs/dev-setup.md`)
- [x] Salin isi `blog-framework-dev-stack.zip` ke root repo, jalankan `docker compose up -d`, lalu `docker compose --profile test run --rm db-test` sampai 50 pemeriksaan lulus di PostgreSQL 18
- [x] Rapikan workspace: blog-framework-dev-stack jadi satu-satunya sumber. Arsipkan `blog-framework-db-v1/`, hapus `0001_core.sql` dan `docker-compose.yml` lepas di root.
- [x] ESLint dengan aturan import: `templates/*` hanya boleh `template-kit`
- [x] Vitest di root dengan satu test contoh
- [x] CI: lint, typecheck, unit test, dan `run_all.sh` dengan service postgres:18
- [x] ADR-001 mode deploy, ADR-002 Nuxt tanpa NestJS, ADR-003 migration SQL tangan, ADR-004 versi Drizzle, ADR-005 kontrak template

**Gate:** CI hijau dari repository yang baru dibuat, termasuk 42 test database di PostgreSQL 18.
✅ Lulus 17 Nov 2026: pipeline #3078334327 (commit 9df99b4), job check dan db hijau.

## M1 — Database v1

- [x] Desain 16 tabel, konvensi, dan constraint integritas antar-site
- [x] `0001_core.sql`, `dev_seed.sql` (idempotent), `integrity_test.sql`, dan `run_all.sh`
- [x] 42 test integritas + uji seed idempotent lulus di PostgreSQL 16 dan 18.7
- [x] Runner migration (`schema_migrations` + checksum, satu transaksi per file) dan role aplikasi `blog_app` tanpa hak DDL
- [x] `run_all.sh` wajib menerima `APP_DB_PASSWORD` dan tidak lagi memakai default `blog_app_dev_password`
- [x] Koneksi database di `packages/db`: pool + environment variable `DATABASE_URL`
- [x] Schema Drizzle bertipe dari SQL (`drizzle-kit pull`), lalu cek composite FK dan partial index terbaca benar
- [x] Skema Zod untuk `sites.settings` dan block body v1 (paragraph, heading, image, quote, list, embed)
- [x] Fungsi `extractBodyText()` untuk mengisi `body_text`, dengan test
- [x] Repository site: cari site berdasarkan domain dan code, ambil theme aktif
- [x] Repository konten publik: feed, listing per kategori/tag/author dengan pagination, artikel dan halaman berdasarkan slug, menu sebagai tree, cari redirect
- [x] Test repository: setiap fungsi wajib menerima `siteId`, dan data site lain tidak pernah terbaca

**Gate:** `run_all.sh` + test repository hijau di CI.
✅ Lulus 19 Nov 2026: pipeline hijau (commit fea423a), job check dan db hijau.

Commit M1: ee02dea (koneksi DB, drizzle-kit pull, run_all.sh), 1537c45 (Zod block body v1, sites.settings, extractBodyText), fea423a (repository site/konten/menu + test isolasi).

## M2 — Tampilan pertama 🟡

### Pemeriksaan poin yang ada (19 Nov 2026)

| Poin | Kondisi repo | Catatan |
|---|---|---|
| Site resolver dua mode | Core sudah punya `sites.findByDomain`, `findByCode`, `getActiveTheme`, `normalizeHost`. Domain lokal sudah ada di seed dan `docs/dev-setup.md`. | Yang belum ada: middleware Nuxt, konfigurasi mode, dan konteks per request. |
| template-kit, base, magazine | Ketiganya baru berisi `package.json`. | Rancangan manifest ada di guide. `migrateConfig` dan layout berbasis section adalah M3, jadi M2 cukup validasi config + fallback default. |
| Route publik | Repository untuk semua route sudah ada (feed, listing kategori/tag/author, artikel, halaman, pencarian). | Skema URL belum diputuskan. Guide mencatat slug halaman bisa bentrok dengan kategori. |
| Block renderer, SEO, sitemap, robots, RSS | Skema block v1 dan `parseBodyLenient` sudah ada. `sites.settings.seo` sudah divalidasi. | Embed hanya youtube/vimeo/x dengan URL https; renderer membangun iframe sendiri. |
| Gate | — | Site kuliner di seed memakai template `news`, yang baru ada di M3. Di M2 site itu jatuh ke `base` (sesuai aturan "template tidak ditemukan → base + catat error"), sementara tekno memakai `magazine`. Jadi gate "dua domain tampil berbeda" tetap bisa diuji dan sekaligus menguji jalur fallback. |

### Rincian

Usulan A–E disetujui 19 Nov 2026 dan sudah dimasukkan ke rincian di bawah (ditandai [A]–[E]).

**2.0 Fondasi aplikasi web**
- [x] [A] Scaffold `apps/web`: Nuxt 4.6.4, server routes memakai `nuxt/server` (ADR-002), satu koneksi database per proses yang ditutup saat shutdown, endpoint `/api/health` yang mengecek database, script `pnpm dev`/`build`
- [x] [B] ESLint untuk `.vue` (`eslint-plugin-vue`) + kasus `.vue` di `tests/architecture.test.ts`
- [x] [B] Typecheck `apps/web` dan template dengan `vue-tsc` (lewat `nuxt typecheck`), masuk `pnpm check`
- [x] [E] Job CI yang mem-build `apps/web` (+ smoke test hasil build)

**2.1 Site resolver**
- [x] Konfigurasi mode lewat env: `SITE_MODE=single|multi`, `SITE_CODE` (single), divalidasi Zod saat start; config salah → proses gagal start
- [x] Middleware server: Host → site (multi) / `SITE_CODE` + cek domain (single); hasil disimpan di `event.context`, tanpa state global (ADR-001)
- [x] Host tidak dikenal → 404 netral tanpa template; domain alias (`isPrimary = false`) → redirect 301 ke primary domain
- [x] Test: dua mode, host huruf besar/port, alias, host tak dikenal

**2.2 template-kit, base, magazine**
- [x] `template-kit`: `defineTemplate`, tipe manifest, tipe view model per jenis halaman, util token → CSS variable
- [x] Registry template + pemuatan theme aktif: template tak ditemukan → base + log error; tokens/options divalidasi skema manifest, key tidak valid jatuh ke default
- [x] `templates/base`: layout, header, footer, menu (tree), kartu artikel, pagination, SmartImage, view untuk semua jenis halaman, 404 — gaya netral
- [x] `templates/magazine`: manifest 1.0.0, token, CSS; tanpa override komponen
- [x] Token dirender jadi CSS variable di `<head>`; halaman dibungkus kelas root `.tpl-<key>`
- [x] Font dari token (Inter, Merriweather, Source Sans 3) di-self-host, bukan dari CDN
- [x] [D] URL media: fungsi `storage_key → URL` (sisi baca storage adapter, disk lokal; upload tetap M4) dipakai SmartImage
- [x] [D] File gambar dev untuk media seed (placeholder), tidak masuk Git bila besar — dibuat route `/media` di dev (SVG placeholder), tanpa file sama sekali
- [x] Tambahan dari pengerjaan: `vue-tsc` untuk `templates/` masuk `pnpm typecheck`; test render SSR semua view base; test CSS template wajib di bawah kelas root; ESLint melarang import nilai `core`/`db` di `apps/web/app/`; smoke test build merender halaman tiap domain (CI job `build` kini memakai PostgreSQL); `pnpm dev` hanya di `localhost`

**2.3 Route publik**
- [x] Putuskan skema URL dan catat sebagai ADR: artikel mengikuti `settings.permalink`, lalu prefix untuk kategori, tag, author, halaman (`/p/{slug}`?), pencarian — ADR-006: `/category`, `/tag`, `/author`, `/search`, `/p/{slug}`, `?page=N`
- [x] View model per jenis halaman dibangun di core dari repository (template hanya menerima view model)
- [x] Route: home, kategori (+ pagination), artikel, halaman (`view_key`), tag, author, pencarian (`?q=`), 404
- [x] Tanggal ditampilkan dengan `site.timezone` dan `defaultLocale`
- [x] [C] Sebelum 404: cek `content.findRedirect`, kirim redirect dengan status code dari database
- [x] Tambahan dari pengerjaan: ADR-007 (halaman dirender penuh di server, view model dibangun di Nitro); artikel di path non-kanonik → 301; slash di ujung → 301; `?page` tidak valid atau di luar jangkauan → 404; repository `getMediaByIds` dan `publishedAt` di target menu artikel

**2.4 Block renderer, SEO, feed**
- [x] Komponen base untuk 6 tipe block; tipe tidak dikenal dan `bodyIssues` dirender kosong + dicatat, tidak crash — test body rusak dengan repository palsu; log `[page] ...`
- [x] Embed: iframe dibangun dari provider + url, bukan HTML mentah
- [x] Meta SEO: title dari `titleTemplate`, description, canonical ke primary domain, Open Graph
- [x] `sitemap.xml`, `robots.txt`, RSS per domain; artikel terjadwal tidak muncul
- [x] Tambahan dari pengerjaan: kolom `seo` konten (title, description, canonical, og_image_id, robots) menimpa nilai otomatis; pencarian dan 404 `noindex`; tautan RSS dan favicon di `<head>`; repository `listSitemapEntries`; perbaikan pesan log media hilang (posisi block menyesatkan)

**2.5 Test pembukti gate**
- [x] [E] Test SSR paralel dua domain: judul, logo, menu, dan kelas root tidak tertukar — `pnpm --filter @framework/web gate` (240 request, 32 paralel, server hasil build), masuk CI job `build`; terbukti gagal saat state global disisipkan
- [x] [E] Snapshot test view model per jenis halaman — `packages/core/src/views/view-models.snapshot.test.ts` (chrome dua site + 10 jenis halaman/redirect)

**Gate:** dua domain dari satu server tampil berbeda; request paralel tidak saling tertukar.
Lulus lokal 19 Nov 2026: `pnpm check` (376 test), smoke + gate di build produksi. Menunggu pipeline CI hijau.
20 Nov 2026: domain dev pindah ke `*.localhost` (tanpa file hosts); diulang setelah `pnpm db:reset`: `pnpm check` (376 test), `pnpm db:test`, smoke dua domain, gate. Hidrasi diperiksa dengan Chromium headless (Playwright) di `pnpm dev`: 11 halaman di tiga domain, semuanya ter-hydrate tanpa peringatan mismatch atau page error.

## M3 — Template kedua (titik evaluasi)

- [ ] `templates/news` dengan susunan home, token, serta CSS kartu dan header yang berbeda, memakai komponen base tanpa override
- [ ] Layout home berbasis section dari `site_themes.layouts`
- [ ] Satu contoh `migrateConfig` (naikkan magazine ke 1.1.0)

**Gate:** news selesai tanpa mengubah core, atau setiap perubahan core dicatat sebagai ADR perbaikan kontrak.
**Evaluasi:** apakah admin (M4) atau produksi dengan data seed/manual (M5) yang lebih dulu?

## M4 — Admin minimal

- [ ] Login satu admin (Argon2id), mode semua site dan satu site
- [ ] CRUD artikel dengan block editor, kategori, tag, menu, halaman
- [ ] Upload media ke disk lokal lewat storage adapter
- [ ] Pengaturan tema: form dari skema manifest + preview sebelum aktif
- [ ] Revisi otomatis dan redirect otomatis saat slug berubah

**Gate:** satu artikel dibuat, dijadwalkan, dan tampil tepat waktu tanpa menyentuh database manual.

## M5 — Produksi pertama (titik evaluasi)

- [ ] Deploy ke VPS dengan Docker; TLS
- [ ] Backup PostgreSQL otomatis + satu kali uji restore
- [ ] Cache publik dengan TTL pendek; storage R2 bila media mulai banyak
- [ ] Monitoring dasar: error, latency, ukuran database

**Gate:** satu site nyata live; restore backup berhasil.
**Evaluasi:** data trafik dan pengalaman nyata menentukan apa yang diambil dari backlog.

---

## Definition of Done (berlaku untuk setiap task)

- [ ] Gate task atau milestone terpenuhi
- [ ] Aturan baru punya test; CI hijau
- [ ] Perubahan schema = file migration baru; file lama tidak diedit setelah jalan di luar laptop
- [ ] Tidak ada secret di Git
- [ ] ADR ditulis bila keputusan mahal diubah

**Retro mini di setiap gate:** catat apa yang lebih lama dari dugaan, apa yang ternyata tidak perlu, dan apa yang perlu diubah di roadmap. Hasil retro M3 dan M5 menentukan urutan berikutnya.

## Test sebagai reviewer

| Aturan | Test |
|---|---|
| Data site tidak bercampur di database | `integrity_test.sql` (sudah ada) |
| Tidak ada query tanpa siteId | Test repository di `packages/core` |
| Template tidak tertukar antar domain | Dua request SSR paralel, cek judul, logo, menu, kelas root |
| View model tidak berubah diam-diam | Snapshot test per jenis halaman |
| Template tidak mengakses data | Aturan import di linter |

## Backlog setelah M5

Ditunda sampai pemicunya terjadi. MVP = M0–M5.

| Item | Diambil saat | Catatan |
|---|---|---|
| AI sebagai penghasil draft: queue BullMQ, worker, tabel AI | Publikasi manual stabil dan butuh volume konten | Hasil AI selalu DRAFT/REVIEW; bagian 10 dokumen lama tetap berlaku |
| Banyak user + permission granular | Ada editor atau penulis lain | `site_members.role` sudah ada; tambah permission per aksi |
| RLS | Multi-site produksi dengan lebih dari satu admin | `SET LOCAL` di dalam transaksi; uji dengan role non-superuser (bagian 4.7 dokumen lama) |
| Audit log | Lebih dari satu admin | Catat publish, perubahan domain, perubahan tema |
| Scheduler dan invalidasi cache berbasis event | TTL cache tidak lagi cukup | Baru di sini Redis/BullMQ diperlukan |
| Multi-bahasa dalam satu site | Ada site dwibahasa | Tambah locale + grup terjemahan di articles |
| Pencarian lebih baik | Pencarian simple dikeluhkan | Uji indonesian, pg_trgm, atau mesin pencari terpisah |
| Slot iklan dan analitik | Site mulai punya trafik | Slot sudah dideklarasikan di manifest template |
| API terpisah (NestJS) | Butuh API untuk aplikasi mobile atau pihak ketiga | `packages/core` bisa dipasang ke NestJS tanpa ditulis ulang |
| Komentar, newsletter | Ada permintaan pembaca | — |
