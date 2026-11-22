# Task List — Framework Web Artikel Multi-Template

Sumber: Google Doc "Revisi Implementation Guide — Framework Web Artikel Multi-Template" (Drive, folder "Framework Web Artikel Multi-Template").
Diambil dari dokumen pada 19 Nov 2026. Sejak itu file ini menjadi daftar task kerja dan tidak disinkronkan lagi dengan dokumen.

## Ringkasan progres

| Milestone | Task selesai | Gate |
|---|---|---|
| M0 — Fondasi | 10 / 10 | ✅ Lulus 17 Nov 2026 — pipeline #3078334327 (commit 9df99b4) |
| M1 — Database v1 | 12 / 12 | ✅ Lulus 19 Nov 2026 — pipeline hijau (commit fea423a) |
| M2 — Tampilan pertama | 30 / 30 | ✅ Lulus 20 Nov 2026 — pipeline hijau (commit c312b05) |
| M3 — Template kedua (titik evaluasi) | 25 / 25 | ✅ Lulus 21 Nov 2026 — pipeline hijau (commit a0b1a23) |
| M4 — Admin minimal | 27 / 27 | ✅ Lulus 22 Nov 2026 — pipeline hijau (commit bbc42fb) |
| M5a — Alur konten AI dan approval | 22 / 22 | ✅ Lulus 22 Nov 2026 — pipeline hijau (commit e7a7cdb) |
| M5 — Produksi pertama (titik evaluasi) | 6 / 28 | — task lokal selesai, pipeline hijau 9d18074; task deploy ditahan sejak 22 Nov 2026 |

**Task berikutnya:** M0–M4 selesai. M5a (alur konten AI dan approval) 22/22, gate lulus 22 Nov 2026 (pipeline hijau, e7a7cdb). Task deploy M5 **ditahan**; task lokal M5 selesai dan pipeline hijau pada 9d18074 (22 Nov 2026): 5.1b `site:create`, header cache di aplikasi, log JSON, backup/restore; sisa M5 adalah deploy (ditahan). Daftar task berikutnya: [Antrian task berikutnya](#antrian-task-berikutnya). Kontrak untuk AI agent: [docs/kontrak-agent.md](docs/kontrak-agent.md). Skill Claude Code per task: lihat [Skill Claude Code](#skill-claude-code).

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

## M2 — Tampilan pertama

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
✅ Lulus 20 Nov 2026: pipeline hijau (commit c312b05), job check, db, dan build (smoke + gate paralel) hijau.
Sebelumnya, 20 Nov 2026: domain dev pindah ke `*.localhost` (tanpa file hosts); diulang setelah `pnpm db:reset`: `pnpm check` (376 test), `pnpm db:test`, smoke dua domain, gate. Hidrasi diperiksa dengan Chromium headless (Playwright) di `pnpm dev`: 11 halaman di tiga domain, semuanya ter-hydrate tanpa peringatan mismatch atau page error.

Commit M2: cb5f0c6 (template-kit, base, magazine, route publik, block renderer, SEO, feed), c312b05 (gate paralel, snapshot view model, domain `.localhost`, sumber tutorial).

**Retro mini M2**
- Lebih lama dari dugaan: domain dev. `.local.test` butuh file hosts Windows (hak Administrator) dan `allowedHosts` Vite, lalu diganti `.localhost`. Cek hidrasi juga butuh browser headless yang dipasang manual karena mesin dev tanpa browser.
- Ternyata tidak perlu: file gambar dev. Route `/media` yang membuat SVG placeholder sudah cukup.
- Perlu diubah di roadmap: theme diresolve di plugin Vue setelah view model jadi. Section home (M3) butuh layout tervalidasi sebelum core mengambil data, jadi M3 pasti menyentuh core dan `apps/web` (lihat usulan A dan B).

## M3 — Template kedua (titik evaluasi)

### Pemeriksaan poin yang ada (20 Nov 2026)

| Poin | Kondisi repo | Catatan |
|---|---|---|
| `templates/news` dengan susunan home, token, CSS kartu dan header berbeda, tanpa override | `templates/news` baru berisi `package.json`. Seed sudah menyimpan theme `news` 1.0.0 untuk dapur-nusantara (merah/krem, Merriweather + Source Sans 3, `header.style: left`, radius 2px). Site itu kini jatuh ke `base`. | Opsi base hanya `header.style` (left/centered) dan `header.showDate`, jadi header dan kartu yang berbeda harus dibuat lewat CSS di bawah `.tpl-news`. Bila CSS tidak cukup, tambahkan opsi di base (versi minor), bukan override. Smoke dan gate saat ini mengharapkan `tpl-base` untuk kuliner, jadi harus diperbarui; jalur fallback tetap teruji di `theme.test.ts`. |
| Layout home berbasis section dari `site_themes.layouts` | Kolom `layouts` sudah dibaca `getActiveTheme` tetapi belum dipakai. Seed: magazine `hero`, `latest-grid`, `category-strip`; news `headline-list`, `category-strip`. `HomeView` hanya berisi `featured`, `latest`, `pagination`. Manifest belum mengenal `sections`/`defaultLayouts`. | Tidak bisa selesai tanpa mengubah core: menurut guide (alur render langkah 4) core yang mengambil data setiap section, padahal theme baru diresolve di `app/plugins/site.server.ts` setelah view model dibangun di Nitro. Jadi gate M3 akan lewat jalur "perubahan core dicatat sebagai ADR". Contoh manifest di guide menaruh komponen section di paket template (`./sections/Hero.vue`), bertentangan dengan keputusan 17 Nov bahwa semua template memakai komponen dari base. |
| Satu contoh `migrateConfig` (magazine ke 1.1.0) | `resolveTheme` hanya mencatat issue bila versi mayor berbeda ("migrateConfig belum didukung"). Seed magazine menyimpan `options.adSlots`, yang tidak ada di skema dan muncul di log setiap start. | Menurut semver guide, minor = opsi baru dengan default dan tidak butuh migrasi; contoh guide (`'1.0.0': (cfg) => cfg`) hanya menguji jalurnya. Supaya contoh 1.1.0 menguji transformasi nyata, lihat usulan D. |

### Usulan

Usulan A–F di [docs/usulan-m3.md](docs/usulan-m3.md) disetujui 21 Nov 2026 dan sudah dimasukkan ke rincian di bawah (ditandai [A]–[F]).

### Rincian (dirinci ulang 21 Nov 2026)

Baris `› Skill` menyebut skill Claude Code yang dipakai untuk task di atasnya (lihat [Skill Claude Code](#skill-claude-code)).

**3.0 Kontrak section dan manifest server [A] [B] [C]**
- [x] ADR-008: section di base, kosakata data section, entry `./manifest`, theme diresolve di Nitro; alternatif ditolak: validasi layout di core
- [x] template-kit: `sections` (skema props Zod + `data(props)`), `defaultLayouts`, tipe permintaan data (`articles` dengan `source: latest | featured | category | tag`, `slug`, `limit`), tipe `SectionView`
- [x] [C] Validasi layout per item: tipe tak dikenal atau props salah → section dilewati + issue; `layouts.home` kosong atau tidak valid → `defaultLayouts.home`; batas `limit` per section dan jumlah section per halaman (angkanya ditetapkan di ADR-008)
- [x] Entry `./manifest` (tanpa `.vue`/`.css`) untuk base dan magazine, didaftarkan di `exports` package
- [x] Registry server di `apps/web/server/utils/` yang hanya memakai entry `./manifest`
- [x] Middleware `site.ts`: theme diresolve dulu, layout home diteruskan ke page builder; `plugins/site.server.ts` memakai theme dari `event.context`
- [x] Titik cek: `pnpm check`, smoke, dan gate M2 tetap hijau — 21 Nov 2026 (build + smoke + gate 240 request hijau; tampilan home ikut berubah karena 3.1 dikerjakan bersamaan)
- › Skill: `/code-review` (level high) pada diff 3.0 sebelum commit; `/simplify` bila registry dan manifest jadi berlapis
- Code review (level high, 21 Nov 2026, diff 3.0 + 3.1): diperbaiki: artikel tak terjangkau dari pagination home bersection (`?page=N` kini arsip dari artikel terbaru, ADR-008), section belakang kosong bila total limit > 50 (kini berurutan dengan `excludeIds`), registry server dan Vue tanpa uji kesamaan (`server/utils/templates.test.ts`), `issues` theme ikut payload browser. Tidak diubah: `layouts.home: []` tetap jatuh ke default (sesuai usulan C); log issue section per request (pola sama dengan log `[page]`).

**3.1 Layout home berbasis section [A] [C]**
- [x] Core: eksekusi permintaan data section dengan repository yang ada; batas `limit`; artikel yang sudah tampil di section sebelumnya tidak diulang
- [x] `HomeView.sections` (field baru, aman menurut ADR-005); section hanya di halaman 1, `?page=N` tetap daftar terbaru + pagination
- [x] Komponen section di `templates/base/src/sections/`: `hero`, `latest-grid`, `headline-list`, `category-strip` (nama dari seed); tanggal memakai format yang sama dengan view lain
- [x] `defaultLayouts.home` untuk base dan magazine
- [x] Snapshot view model home dengan section (dua site); test render SSR view home dengan section
- › Skill: `frontend-design:frontend-design` untuk markup dan gaya netral komponen section di base; `/run` untuk melihat home tekno di browser

**3.2 Template news**
- [x] `templates/news` 1.0.0: manifest + entry `./manifest`, token default sesuai seed, CSS kartu dan header di bawah `.tpl-news`, `defaultLayouts.home`; tanpa override komponen
- [x] Bila CSS tidak cukup: opsi baru di base (versi minor), bukan override — tidak diperlukan, CSS cukup
- [x] Daftarkan di registry server dan Vue; kuliner tampil dengan news — seed theme news tanpa `options.adSlots` (bukan opsi news; template baru, jadi tanpa migrasi)
- [x] Test manifest news dan test CSS di bawah kelas root (seperti magazine)
- › Skill: `frontend-design:frontend-design` untuk arah visual news yang jelas berbeda dari magazine (tipografi, header, kartu), hanya lewat token dan CSS; `/run` + screenshot dari skrip 3.4 untuk membandingkan tiga site

**3.3 migrateConfig [D]**
- [x] `resolveTheme`: migrasi berantai dari versi tersimpan ke versi terpasang untuk tokens, options, dan layouts, sebelum validasi; wajib untuk mayor, boleh untuk minor
- [x] Versi tersimpan lebih baru dari terpasang → default + issue; migrasi yang melempar error → default + issue; baris database tidak ditulis ulang (config ditulis saat disimpan dari admin, M4)
- [x] Magazine 1.1.0 dengan migrasi `1.0.0 → 1.1.0` yang membuang `options.adSlots`; peringatan di log hilang — slot `header_banner` kini di `adSlots` manifest; kunci migrateConfig = versi tujuan (ADR-008 butir 8)
- [x] Test template-kit: rantai migrasi, versi lebih baru, migrasi error

**3.4 Test pembukti dan cek browser [E] [F]**
- [x] Smoke dan gate paralel: kuliner `tpl-news` beserta marker news — gate memeriksa kelas root, token, dan section home per site; smoke memeriksa template per host (`SMOKE_HOSTS=host=template`). Server memuat tiga template, dua dipakai site seed; base diuji sebagai fallback di test template-kit
- [x] Test arsitektur: entry `./manifest` tidak meng-import `.vue`/`.css` — `tests/template-manifest.test.ts`, menelusuri import tidak langsung, dengan test kontrol
- [x] Skrip Playwright lokal di `apps/web/scripts/` (cek hidrasi + screenshot per domain), tidak di CI; cara pakai di `docs/dev-setup.md` — `pnpm --filter @framework/web browser-check`: 12 halaman × desktop/ponsel, terbukti gagal saat mismatch disisipkan
- › Skill: `/run` untuk menjalankan app dan skrip cek

**3.5 Penutup**
- [x] Bab tutorial (`docs/tutorial/tutorial.tpl.md` + `pnpm tutorial`), dengan catatan di bab lama yang filenya berubah — 4 bab baru: section home, template kedua, migrasi config, cek hidrasi
- [x] Commit, pipeline hijau, retro mini M3, evaluasi urutan M4/M5 — pipeline hijau pada a0b1a23; M4 lebih dulu
- Code review (level high, 21 Nov 2026, `f2503b4..7043fd6`, 3.2–3.4): semua 8 temuan diperbaiki: versi tersimpan dibaca sebagai angka seperti CHECK database (`1.01.0`), hasil migrasi wajib berisi tokens/options/layouts, setiap mayor yang dilewati wajib punya langkah `X.0.0` (termasuk 0.x → 1.x), `structuredClone` di dalam try, smoke memeriksa template per host (`SMOKE_HOSTS=host=template`, juga di CI), `browser-check` menolak `BASE_URL` tanpa `{host}` dan hanya mengabaikan 404 dokumen sendiri, nama paket `libasound2` untuk Ubuntu lama, teks TASKS "tiga template"
- › Skill: `/code-review` (level high) untuk seluruh diff M3 sebelum commit

**Gate:** news selesai tanpa mengubah core, atau setiap perubahan core dicatat sebagai ADR perbaikan kontrak.
Status 21 Nov 2026: news selesai tanpa komponen sendiri dan tanpa mengubah core di 3.2. Perubahan core M3 (eksekusi data section, `excludeIds`, theme diselesaikan sebelum view model, `?page=N` arsip) dicatat di ADR-008. Lokal hijau: `pnpm check` (439 test), build, smoke (`tekno=magazine`, `kuliner=news`), gate 240 request, browser-check 24 halaman.
✅ Lulus 21 Nov 2026: pipeline hijau (commit a0b1a23).
**Evaluasi:** apakah admin (M4) atau produksi dengan data seed/manual (M5) yang lebih dulu?
Keputusan 21 Nov 2026: **M4 dulu.** Tanpa admin, konten site nyata di M5 harus diisi lewat SQL manual; config theme juga baru ditulis dalam versi terpasang saat disimpan dari admin.

Commit M3: f2503b4 (3.0–3.1), 53343bd (3.2), 7a03cb3 (3.3), 7043fd6 (3.4), ditambah commit penutup 3.5.

**Retro mini M3**
- Lebih lama dari dugaan: memisahkan manifest dari komponen. Nitro tidak bisa meng-import `.vue`/`.css`, jadi setiap template butuh dua entry, dua registry, dan test yang menjaga keduanya. Code review juga menemukan dua hal yang tidak terlihat dari test: pagination home bersection meninggalkan artikel yang tak terjangkau, dan aturan versi template-kit lebih ketat dari CHECK database. Dev server yang menyimpan komponen lama setelah file dikembalikan sempat membuat hasil cek browser menyesatkan.
- Ternyata tidak perlu: opsi baru di base atau override komponen untuk news; token, layout section, dan CSS cukup. Request data kedua untuk section juga tidak perlu karena theme diselesaikan di middleware.
- Perlu diubah di roadmap: M4 (pengaturan tema) bergantung langsung pada hasil M3: form dibangkitkan dari skema manifest, layout divalidasi `resolveLayout`, dan config ditulis dalam versi terpasang. Arti `layouts.home: []` (kini = default) perlu diputuskan sebelum form layout dibuat, karena form harus bisa menyatakan "tanpa section" bila itu diinginkan.

## M4 — Admin minimal

### Pemeriksaan poin yang ada (21 Nov 2026)

| Poin | Kondisi repo | Catatan |
|---|---|---|
| Login satu admin (Argon2id), mode semua site dan satu site | Tabel `users` (`password_hash` Argon2id, `status`) dan `site_members` (`OWNER`/`EDITOR`/`AUTHOR`) sudah ada. Belum ada tabel sesi, library Argon2, maupun cara membuat admin pertama. Middleware `site.ts` memperlakukan setiap path selain bypass sebagai halaman publik, jadi `/admin` sekarang dijawab 404 oleh page builder. | Perlu diputuskan di host mana admin dilayani dan bagaimana dirender; ADR-007 hanya mengatur halaman publik (usulan A). Gate melarang menyentuh database manual, jadi admin pertama dibuat lewat perintah CLI (usulan B). |
| CRUD artikel dengan block editor, kategori, tag, menu, halaman | Repository core hanya membaca. Skema Zod block v1 dan `extractBodyText` sudah ada. Role `blog_app` sudah punya INSERT/UPDATE/DELETE. Kolom `articles.version` untuk optimistic locking sudah ada. | Butuh repository tulis di core dengan aturan siteId yang sama seperti repository baca. Block editor untuk 6 tipe block v1 (usulan C). |
| Upload media ke disk lokal lewat storage adapter | `packages/core/src/media/storage.ts` hanya sisi baca (`storage_key → URL`). Route `/media/[...key]` menyajikan file dari `MEDIA_DIR`. | Sisi tulis: tipe file dibaca dari isinya (bukan nama), batas ukuran, `storage_key` dibuat server, dimensi gambar disimpan di `media`. |
| Pengaturan tema: form dari skema manifest + preview | Bergantung pada M3: manifest server [B] dan `migrateConfig` [D]. Zod 4 punya `z.toJSONSchema`. | Form dibangkitkan dari skema manifest (tokens, options, layouts). Preview tidak boleh mengubah theme aktif (usulan D). Menyimpan berarti menulis config dalam versi terpasang, sekaligus menutup catatan [D] di M3. |
| Revisi otomatis dan redirect otomatis saat slug berubah | Tabel `article_revisions` (`revision_no` = `articles.version`) dan `redirects` sudah ada; `findRedirect` sudah dipakai route publik. | Snapshot revisi dan redirect ditulis dalam transaksi yang sama dengan update artikel. Rantai redirect (A→B lalu B→C) diratakan supaya tidak 301 berantai. |
| Gate: artikel dijadwalkan tampil tepat waktu | Terjadwal = `PUBLISHED` + `published_at > now()`, sudah difilter di query publik, sitemap, dan RSS. HTML publik belum dikirim dengan header cache; feed di-cache 300 detik. | Tidak butuh scheduler atau queue. Tanpa cache HTML, "tepat waktu" berarti tampil pada request pertama setelah `published_at`. Bila M5 menambah cache, toleransinya sebesar TTL. |

### Usulan

Usulan A–G di [docs/usulan-m4-m5.md](docs/usulan-m4-m5.md#m4--admin-minimal) disetujui 21 Nov 2026, kecuali E (pulihkan revisi) yang ditunda ke backlog. Keputusan tambahan: `layouts.home: []` berarti "tanpa section" (home gaya lama), key yang tidak ada tetap berarti `defaultLayouts`; dikerjakan di awal M4 karena form layout di 4.4 membutuhkannya.

### Rincian (21 Nov 2026)

**4.pre Arti layout kosong**
- [x] `resolveLayout`: array kosong = tanpa section, tanpa issue; key tidak ada atau layout rusak tetap `defaultLayouts`; ADR-008, test, tutorial

**4.0 Fondasi admin [A] [B] [G]**
- [x] ADR-009: host admin, cara render (SPA), sesi cookie, library Argon2id; site middleware melewati `/admin` dan `/api/admin`
- [x] Sesi cookie terenkripsi (secret dari env; `HttpOnly`, `SameSite=Lax`, `Secure` di produksi) dengan masa berlaku; tanpa tabel sesi — 8 jam; logout tidak mencabut cookie yang sudah tersalin (dicatat di ADR-009)
- [x] Login dan logout dengan Argon2id; pesan gagal yang sama untuk email tidak ada dan password salah
- [x] [B] CLI `pnpm admin:create`: email dari argumen, password dari prompt (bukan argumen), user `ACTIVE` + `site_members` `OWNER` — juga `--superadmin` dan `--reset-password` (admin seed tanpa password)
- [x] Mode `multi` → pemilih site dari `site_members`; mode `single` → hanya site `SITE_CODE` — data site per mode (`users.listSites`, `/api/admin/me`); tampilan pemilih di 4.2
- [x] Guard `/api/admin/*`: sesi valid + anggota site yang diminta — `requireAdmin` + `requireSite` (404 untuk site orang lain); dipakai route site mulai 4.1
- [x] [G] Rate limit login per IP + email; method non-GET wajib `Origin` yang sama dengan host admin
- [x] Test: login benar/salah, sesi kedaluwarsa, user `DISABLED`, akses ke site yang bukan miliknya ditolak — `gate-admin.mjs` (22 pemeriksaan, di CI job `build`), test core auth + repository user (DISABLED); kedaluwarsa sesi mengandalkan TTL seal h3 (tidak diuji); akses site lain diuji di 4.1
- › Skill: `/security-review` setelah 4.0 selesai; `/code-review` (level high)
- Security review (21 Nov 2026): 1 temuan sedang diperbaiki: path ter-encode (`/api/%61dmin/...`) melewati aturan host admin dan Origin karena middleware membaca path mentah sementara router men-decode; terbukti login lewat domain site publik berhasil. Perbaikan: `routedPath` di middleware + `assertAdminRequest` di handler; 5 kasus baru di `gate-admin`, terbukti gagal tanpa perbaikan.
- Code review (level high, 21 Nov 2026, diff 4.0): 9 temuan, semuanya ditindaklanjuti: rate limit dicatat sebelum verifikasi (login paralel lolos semua), segmen `admin` dicadangkan di URL konten, `TRUST_PROXY` untuk IP klien di belakang proxy (tanpa itu satu ember IP untuk semua klien), API admin non-GET di domain alias mode single 404, `ADMIN_PASSWORD` hanya tanpa terminal, prompt menyimpan sisa input paste, hash palsu gagal tidak di-cache, logout gagal menampilkan pesan; `--reset-password` tidak mencabut sesi lama dicatat di ADR-009.

**4.1 Repository tulis di core**
- [x] Buat, ubah, arsipkan: artikel, halaman, kategori, tag, menu; siteId wajib; body divalidasi skema block v1; `body_text` dari `extractBodyText` — `packages/core/src/editor/` (repository `editor`); arsip: artikel ARCHIVED, kategori HIDDEN, tag dan item menu dihapus
- [x] Optimistic locking lewat `version`; konflik → 409 — artikel `version`; halaman/kategori/tag/menu `updatedAt` (tabel tanpa kolom versi); 409 dipetakan di API 4.2
- [x] Slug unik per site, dibuat dari judul bila kosong — juga segmen route sistem ditolak; simpan paralel = galat field slug
- [x] Test isolasi site untuk operasi tulis (menulis ke baris site lain gagal) — di site uji sementara (ARCHIVED), agar tidak mengganggu test lain yang membaca seed
- › Skill: `/code-review` (level high)
- Code review (level high, 22 Nov 2026): 8 temuan diperbaiki: tanggal terbit tidak bisa dikosongkan (tidak dikirim vs null), arsip memvalidasi ulang isi lama, simpan paralel slug sama = error 500, X-Forwarded-For paling kiri bisa dipalsukan (kini paling kanan), user tanpa site tetap punya sesi, field galat gambar OG halaman, komentar sesi login, pembersihan redirect `demo:saksang`. Ikut diperbaiki: sumber test acak sejak M2 (test berbasis seed membaca site fixture sementara dari test lain).

**4.2 Layar admin [A] [C]**
- [x] Layout admin, daftar + form untuk artikel, halaman, kategori, tag, menu (tree) — layout Nuxt `admin`, API per site `/api/admin/sites/:siteId/...` (404/409/422), layar Artikel, Halaman, Kategori (pohon), Tag, Menu (pohon per lokasi)
- [x] [C] Block editor 6 tipe block v1: tambah, ubah urutan, hapus; validasi di server tetap jadi sumber kebenaran — `components/admin/BlockEditor.vue`; block kosong dibuang sebelum dikirim
- [x] Status `DRAFT`/`REVIEW`/`PUBLISHED`/`ARCHIVED`; tanggal terbit diisi dalam `site.timezone`, disimpan UTC — `utils/zoned-time.ts` (diuji termasuk zona ber-DST); status Terjadwal ditampilkan untuk PUBLISHED bertanggal mendatang
- › Skill: `frontend-design:frontend-design` untuk UI admin (layout, form, block editor); `/run` untuk mencoba alurnya di browser
- Code review (level high, 22 Nov 2026, diff 4.2): 10 temuan diperbaiki: simpan halaman/kategori menghapus SEO yang tidak ada di form, logout gagal tetap pindah ke login, target menu artikel di luar 20 terbaru, draf judul saja ditolak (paragraf kosong), detik tanggal terbit terpotong setiap simpan, gambar terpasang di luar 30 media terbaru tampil kosong, galat server di /admin tampil "tidak ada site", galat field ringkasan/tanggal/penulis/tag tidak ditandai, sesi habis tidak kembali ke login, `?page` raksasa = 500. Pesan validasi kini berbahasa Indonesia. Uji browser (Playwright): login, ubah dan simpan, draf judul saja, logout; `gate-admin` 30 pemeriksaan (termasuk user anggota satu site: site lain 404).

**4.3 Media**
- [x] Storage adapter sisi tulis (disk lokal, `MEDIA_DIR`); `storage_key` dibuat server — `core/media/local-storage.ts` (tulis atomik, path dicek), key `<site>/<yyyy>/<mm>/<uuid>.<ext>`
- [x] Upload: tipe dari magic bytes (JPEG, PNG, WebP; SVG ditolak), batas ukuran, dimensi, alt text — `core/media/image-info.ts` (diuji juga dengan file asli dari Chromium), 10 MB dicek dari Content-Length sebelum body dibaca, alt wajib; layar Media dengan titik fokus; hapus hanya bila tidak dipakai
- [x] Pemilih media untuk block gambar dan cover artikel — `MediaPicker` (dialog galeri + unggah) untuk block gambar, gambar utama, gambar OG
- › Skill: `/security-review` (upload adalah input paling berisiko di M4)
- Security review (22 Nov 2026): tidak ada temuan. Catatan privasi: metadata EXIF (termasuk GPS) belum dibuang dari file yang diunggah (butuh pemrosesan gambar; dicatat di dev-setup). `gate-admin` 36 pemeriksaan (upload asli, SVG menyamar 415, tanpa alt 422, nosniff, media site lain 404, media uji dihapus).

**4.4 Pengaturan tema [D]**
- [x] Form dari skema manifest: tokens, options, layout per section — `describeTemplate` (JSON Schema dari Zod, label dari `.meta()`), `SchemaForm`, `LayoutEditor` (bawaan / susunan sendiri / tanpa section)
- [x] [D] Preview config draf tanpa mengubah theme aktif — `/admin/preview/<site>/<path>?draft=<id>` SSR, draf di memori per id (bukan cookie), media lewat `/admin/preview-media`, noindex
- [x] Simpan: validasi, lalu tulis config dalam versi template terpasang — `validateThemeDraft` ketat + `saveTheme` (kunci site, satu aktif, versi terpasang)
- › Skill: `frontend-design:frontend-design` untuk form token (warna, font) dan panel preview
- Code review (level high, 22 Nov 2026, diff 4.4): 10 temuan diperbaiki: template belum disimpan dibuka dengan bawaan base, template aktif tak terdaftar = layar kosong, simpan tema bersamaan = 500 (kini kunci site), kode site seperti `media` membuat pratinjau menampilkan layar admin (kini halaman statis `admin/preview`), draf di cookie bisa > 4 KB dan dua tab saling menimpa (kini memori per id), simpan membuang draf template lain, form pencarian di pratinjau, "belum disimpan" karena urutan key, batas section tertulis langsung. Build produksi merender galat di `/admin/**` sebagai SPA 404: route pratinjau kini menjawab teks dengan status benar (ditangkap gate). `gate-admin` 44 pemeriksaan.

**4.5 Revisi dan redirect**
- [x] Setiap update artikel: snapshot ke `article_revisions` dalam transaksi yang sama, `version` naik — dikerjakan di 4.1 (satu transaksi dengan update)
- [x] Slug artikel atau halaman yang pernah terbit berubah → redirect 301 dari path lama; rantai diratakan; redirect yang menunjuk ke dirinya sendiri dihapus — dikerjakan di 4.1; juga kategori dan tag
- [x] Daftar revisi per artikel — `editor.listRevisions` (4.1); tampilan di 4.2

**4.6 Test pembukti gate dan penutup [F]**
- [x] [F] Skrip gate `apps/web/scripts/gate-admin.mjs`, masuk CI job `build`: login → buat artikel → jadwalkan `published_at` beberapa detik ke depan → sebelum waktunya 404 dan tidak ada di home, sitemap, RSS → sesudahnya tampil — `GATE_SCHEDULE_LEAD_MS` (bawaan 6 detik); request pertama setelah jadwal sudah tampil di URL artikel, home, sitemap, RSS; `publicPath` API sama; artikel uji diarsipkan di `finally`. `gate-admin` 53 pemeriksaan
- [x] Bab tutorial, commit, pipeline hijau, retro mini M4 — bab "Menjadwalkan Artikel dan Menutup Admin"; pipeline hijau pada bbc42fb (dikonfirmasi 22 Nov 2026)
- › Skill: `/security-review` dan `/code-review` (level high) untuk seluruh diff M4 sebelum commit
- Code review (level high, 22 Nov 2026, seluruh diff M4): 6 temuan diperbaiki: media bisa terhapus di tengah simpan artikel yang baru memakainya (kini `FOR SHARE` di `ensureOwned` + `deleteMedia` satu transaksi dengan `FOR UPDATE`; test meniru balapan), "Muat lagi" galeri dobel/terlewat setelah unggah atau hapus (`nextMediaPage` + `appendUnique`), galat hapus file setelah catatan terhapus jadi 500 (kini dicatat saja), percent-encoding rusak di `/media` dan `/admin/preview-media` = 500 (kini 404), artikel uji gate tertinggal terbit bila gate melempar (arsip di `finally`), `demo:saksang --remove` menghapus redirect lain yang memuat "saksang" (kini hanya redirect demo dan yang menunjuk artikel demo).
- Security review (22 Nov 2026, seluruh diff M4): tidak ada temuan. Catatan tanpa dampak: item menu ROUTE menerima `/\evil.com` (browser membacanya seperti `//evil.com`), tetapi hanya admin site yang bisa mengisinya dan admin memang boleh menambah URL eksternal; pratinjau merender konten site di origin admin, aman selama tidak ada `v-html` di template (jaga bila template baru menambah HTML mentah).

**Gate:** satu artikel dibuat, dijadwalkan, dan tampil tepat waktu tanpa menyentuh database manual.

**Retro mini M4**
- Lebih lama dari dugaan: keamanan di sekitar admin, bukan CRUD-nya. Path ter-encode yang lolos aturan host, `X-Forwarded-For`, galat di `/admin/**` yang dirender sebagai SPA 404 di build produksi (tidak terlihat di dev), dan draf pratinjau di cookie yang bisa melewati 4 KB semuanya ditemukan review atau gate, bukan test unit. Referensi media di JSON tanpa foreign key butuh penguncian baris manual.
- Ternyata tidak perlu: scheduler atau queue untuk artikel terjadwal; filter `published_at <= now()` yang sudah ada sejak M2 cukup, dan gate membuktikannya terhadap build. Tabel sesi juga tidak perlu (cookie tersegel, batasnya dicatat di ADR-009).
- Perlu diubah di roadmap: M5 (cache HTML) harus menetapkan TTL sebagai toleransi "tepat waktu" artikel terjadwal dan menyesuaikan gate ini. Penghapusan EXIF dan pulihkan revisi (usulan E) tetap di backlog. Gate admin kini 53 pemeriksaan dan menulis data (artikel arsip uji) ke database lokal; pertimbangkan site uji khusus bila mulai mengganggu.

## M5a — Alur konten AI dan approval

Ditambahkan 22 Nov 2026 setelah pemilik proyek memperjelas tujuan produk. AI agent pembuat konten dibangun di luar repo ini dan menulis ke tabel hasil AI tersendiri; status tabel konten (`articles`) tetap. Approve di admin memindahkan hasil AI ke tabel konten. Usulan, alur, dan tabel keputusan: [docs/usulan-konten-ai.md](docs/usulan-konten-ai.md).

### Pemeriksaan terhadap kode (22 Nov 2026)

| Kebutuhan | Kondisi repo |
|---|---|
| Tabel hasil AI dengan status `READY_TO_PUBLISH` | Belum ada. Status `articles` (`DRAFT, REVIEW, PUBLISHED, ARCHIVED`) tetap dan tidak diubah |
| Approval pagi hari | Belum ada antrian, pratinjau hasil AI, pemeriksaan, atau pemindahan ke tabel konten |
| Agent menulis langsung ke database | Hanya ada role `blog_app` (semua DML); belum ada role terbatas untuk agent |
| Gambar dari object storage | `media.storage_key` (bukan URL) + storage adapter; baru adapter disk lokal; `media.credit` ada, URL sumber belum |
| Video dari alamat asli | Block `embed` (YouTube, Vimeo, X) membangun iframe dari URL asli; belum ada tautan ke sumber di tampilan |
| Referensi | Belum ada tempat penyimpanan maupun tampilan |

### Rincian

**5a.0 Kontrak dan keputusan [K1] [K7]**
- [x] ADR-010 alur konten AI: tabel hasil AI terpisah, agent sebagai `blog_agent`, approve = pindah ke tabel konten dalam satu transaksi (ADR infrastruktur M5 bergeser ke ADR-011) — [docs/adr/010-alur-konten-ai.md](docs/adr/010-alur-konten-ai.md)
- [x] Skema payload hasil AI v1 (Zod, berversi) di `packages/core` — `src/generated/payload.ts`: gambar lewat `key` → `storageKey`, kategori/penulis lewat slug, tag lewat nama (dobel = slug sama), `status`/tanggal ditolak; `parseGeneratedPayload` mengembalikan daftar masalah (path + pesan) untuk layar approval; 20 test
- [x] `docs/kontrak-agent.md`: kolom `generated_articles`, skema payload, cara merujuk kategori/tag/penulis (slug) dan gambar (`storage_key`), provider embed, referensi, contoh SQL satu hasil lengkap — contoh payload di dokumen divalidasi test, jadi kontrak tidak bisa basi diam-diam; tambahan kolom `agent_note` (ringkasan tinjauan AI, tampil di approval)

**5a.1 Migration 0002 [K1] [K6] [K7]**
- [x] Tabel `generated_articles`: `site_id`, `external_id` (unik per site), `agent_note`, `status` (`READY_TO_PUBLISH`, `APPROVED`, `ARCHIVED`), `payload`, `generated_at`, `review_note`, `reviewed_by`, `reviewed_at`, `article_id` (composite FK ke artikel site yang sama) — `0002_konten_ai.sql`; CHECK keputusan (READY ⇔ tanpa `reviewed_at`, ARCHIVED wajib alasan, `article_id` hanya APPROVED dan site yang sama)
- [x] Tabel `article_references`: posisi, judul, URL (CHECK http/https), penerbit, jenis; composite FK; unik (artikel, posisi); `media.source_url` — URL dan posisi unik per artikel; ikut terhapus bersama artikel
- [x] Role `blog_agent` (`agent_role.sql`, idempotent, pola `app_role.sql`): INSERT/UPDATE `generated_articles`, SELECT sites/categories/tags/authors; tanpa akses tulis ke tabel lain — password kosong = NOLOGIN dan role yang ada tidak diubah; dirangkai di `setup.sh`, compose, `.env.example`, CI
- [x] Hak kolom: `blog_agent` hanya INSERT/UPDATE kolom isi (`site_id`, `external_id`, `payload`, `agent_note`, `generated_at`), jadi status dan kolom keputusan tidak bisa diisi agent; trigger: isi hasil yang sudah diputuskan tidak bisa diubah siapa pun — trigger `generated_articles_guard` (P0001)
- [x] Test integritas + hak akses role; `drizzle-kit pull`; seed dev: 2 hasil AI (satu valid, satu dengan galat) beserta referensi — 19 test integritas baru (bagian 7, total 61), 12 pemeriksaan role agent lewat `SET LOCAL ROLE` (bagian 7 `run_all.sh`), total 81 pemeriksaan; schema Drizzle 18 tabel; snapshot view model diperbarui (kredit gambar rendang di seed)

**5a.2 Pemeriksaan dan approve di core [K3] [K4]**
- [x] `reviewGenerated(siteId, id)`: galat dan peringatan sesuai tabel di docs/usulan-konten-ai.md — `repos.generated.review(siteId, id, storage)` di `src/generated/generated-repository.ts`; skema gagal = hanya masalah skema; gambar: prefix kode site, file ada, magic bytes JPEG/PNG/WebP, ekstensi cocok; bentrok redirect **tidak** diperiksa (konten menang atas redirect, `build-page.ts`), dokumen diselaraskan
- [x] `approveGenerated`: satu transaksi, `FOR UPDATE`, periksa ulang, buat media (pakai ulang baris yang `storage_key`-nya sudah ada di site yang sama, karena `uq_media_storage_key` unik global; milik site lain = galat) + artikel (`PUBLISHED` sekarang/terjadwal, atau `DRAFT`) + tag + referensi, hitung `body_text`, revisi pertama mencatat asal hasil AI, tandai `APPROVED` + `article_id` — lewat `editor.tx.createArticle` (isi `createArticle` dipindah ke `createArticleIn` dalam transaksi pemanggil); tambahan: token versi `expectedUpdatedAt` untuk approve dan tolak, karena agent bisa memperbarui hasil yang sama lewat `external_id` setelah admin membukanya
- [x] `rejectGenerated`: alasan wajib → `ARCHIVED` + `review_note` — maks 1.000 karakter
- [x] Referensi untuk artikel biasa: repository editor membaca/menulis `article_references` — juga di revisi dan arsip; `media.sourceUrl` di `mediaMetaSchema`; form artikel admin meneruskan referensi yang dimuat dan layar Media punya field "URL sumber" (tanpa itu simpan dari admin menghapus data baru ini)
- [x] Test: tiap jenis galat, transisi terlarang, dua approve bersamaan = satu artikel, slug bentrok di tengah transaksi, isolasi site — 20 test di `generated-repository.test.ts` (storage tiruan + PNG minimal) dan 5 test referensi/`sourceUrl` di test editor; slug bentrok di tengah transaksi ditangani `withSlugConflict` yang sudah diuji di editor

**5a.3 Antrian approval di admin [K3]**
- [x] API `/api/admin/generated` (semua site milik user) + detail, approve, reject, approve massal (hanya item tanpa galat) — approve massal: satu transaksi per item, yang bergalat atau sudah diperbarui agent dilaporkan per item; `toHttpError` untuk route lintas site
- [x] Halaman "Antrian terbit": daftar per site dengan jumlah galat/peringatan; jumlah antrian di navigasi admin — **tanpa** jumlah galat/peringatan di daftar: menghitungnya berarti membaca semua file gambar setiap kali daftar dibuka; galat tampil di detail dan di laporan approve massal. Filter site dan status (menunggu/disetujui/ditolak)
- [x] Halaman detail: pratinjau hasil AI dengan template site (SSR di host admin, `noindex`, `no-store`, hanya admin site itu), daftar pemeriksaan, daftar referensi, tombol Terbitkan sekarang / Jadwalkan / Pindahkan sebagai draft / Tolak (alasan wajib) — pratinjau `/admin/preview/<kode>/?generated=<id>` lewat pembangun halaman publik yang sama (`withPreviewArticle` membungkus repository konten), theme aktif, tanpa menulis ke database; 409 = tombol "Muat ulang"
- [x] Editor artikel: bagian referensi — komponen `AdminReferencesEditor`
- › Skill: `frontend-design:frontend-design` untuk halaman antrian; `/run` untuk memeriksa alur di browser
- Catatan 22 Nov 2026: `frontend-design` tidak dipakai; halaman antrian mengikuti bahasa visual admin yang sudah ada (kelas `.adm-*`) agar konsisten. Alur diperiksa dengan skrip Playwright (antrian, detail valid + pratinjau, detail bergalat, form referensi; konsol bersih) dan curl (approve terjadwal, token lama 409, tolak tanpa alasan 422, tanpa Origin 403, approve massal) memakai baris uji sementara yang dihapus sesudahnya.

**5a.4 Referensi di halaman konten [K6]**
- [x] View model artikel: `references` + sumber gambar (`credit`, `source_url`) + URL asli embed — `ReferenceView`, `ArticleView.references`, `ImageView.sourceUrl` (semua gambar, juga logo); URL asli embed sudah ada di `BlockView`
- [x] Komponen base "Sumber dan referensi" di akhir artikel untuk semua template tanpa override; kredit dan tautan sumber di bawah gambar; tautan "Tonton di sumber asli" di bawah embed — `ArticleReferences.vue`, `ImageCredit.vue`; tautan keluar `noopener noreferrer nofollow`
- [x] JSON-LD artikel: `citation`; snapshot view model diperbarui; cek browser 3.4 untuk tiga template — JSON-LD belum ada sebelumnya, jadi dibuat minimal: `Article` (headline, tanggal, gambar, penulis, penerbit, kategori, tag, citation) hanya untuk artikel; `<` di-escape. browser-check: 26 halaman OK (di server dev; build produksi + seed memberi 404 untuk file media seed yang memang tidak ada)

**5a.5 Gate dan penutup [K5]**
- [x] Skrip `gate-content.mjs` di CI: INSERT hasil AI sebagai `blog_agent` → tidak ada yang tampil di web → agent tidak bisa menulis `articles` → hasil rusak tidak bisa di-approve → tolak = `ARCHIVED` → approve lewat API admin → artikel tampil dengan referensinya, juga di home, sitemap, RSS — `apps/web/scripts/gate-content.ts` (TypeScript lewat tsx, karena `pg` tidak bisa di-import dari `apps/web`); CI login langsung sebagai `blog_agent` (`AGENT_DATABASE_URL`), lokal `SET LOCAL ROLE` dari pemilik schema; juga pencarian, pratinjau, sumber gambar, sumber video, JSON-LD citation, dan perubahan setelah diputuskan; 21 pemeriksaan
- [x] Bab tutorial, commit, pipeline hijau, retro mini M5a — bab "Membuktikan Alur Konten AI"; pipeline hijau pada e7a7cdb (dikonfirmasi 22 Nov 2026)
- › Skill: `/security-review` (role dan trigger agent, pratinjau, API antrian) dan `/code-review` (level high) untuk seluruh diff M5a
- Code review (level high, 22 Nov 2026, `bbc42fb..HEAD`): 6 temuan diperbaiki: `dateModified` JSON-LD membuat snapshot gagal di database baru (kini disamarkan), URL yang lolos `z.url()` tetapi ditolak CHECK database (huruf besar, spasi) menjadi 500 saat approve (regex sama dengan database), approve massal 500 pada galat non-editor padahal item sebelumnya sudah terbit (kini per item), hasil yang sudah disetujui dengan slug eksplisit tidak bisa dipratinjau (`ownArticleId`), pesan "Hasil AI tidak ditemukan" untuk kategori yang hilang, gambar agent melewati batas 10 MB dan dibaca utuh ke memori (`storage.size()` + `MAX_IMAGE_BYTES`).
- Security review (22 Nov 2026, seluruh diff M5a): tidak ada temuan dengan keyakinan ≥ 8. Satu temuan keyakinan 7 tetap diperbaiki: halaman detail antrian menjadikan URL referensi dari payload mentah sebagai `href`, jadi `javascript:` dari agent bisa sampai ke origin admin; kini hanya `http(s)` yang menjadi tautan. Diperiksa aman: otorisasi API dan pratinjau per site, path storage, hak `blog_agent` dan trigger, URL publik, JSON-LD, SQL berparameter.

**Gate:** hasil AI di database tidak tampil di web sampai di-approve di admin; hasil yang tidak sesuai aturan tidak bisa dipindahkan ke tabel konten; konten yang terbit menampilkan semua referensinya.

**Retro mini M5a**
- Lebih lama dari dugaan: menyepakati model datanya. Rencana pertama (status baru di `articles`, lalu API ingest) dua kali diganti sebelum ada kode; tabel hasil AI terpisah ternyata yang paling sederhana dan paling aman. Detail yang hanya ketahuan saat dikerjakan: `uq_media_storage_key` unik global, konten menang atas redirect (pemeriksaan slug vs redirect tidak perlu), dan agent bisa memperbarui hasil yang sedang dibaca admin (butuh token versi). Kesalahan URL ditemukan review, bukan test: skema Zod dan CHECK database harus memakai aturan yang sama persis.
- Ternyata tidak perlu: API ingest, queue, dan jumlah galat di daftar antrian. Role database dengan hak per kolom + trigger cukup membatasi agent; pratinjau tidak butuh jalur render sendiri karena pembangun halaman cukup diberi repository konten yang dibungkus.
- Perlu diubah di roadmap: lanjutkan task lokal M5 (5.1b `site:create`, header cache di aplikasi, log JSON, skrip backup/restore) sebelum deploy. Adapter object storage menunggu provider dipilih; agent bisa mulai dibangun memakai `docs/kontrak-agent.md` dan storage lokal. Payload apa pun dari agent tetap dianggap tidak tepercaya, juga di layar admin.

---

## Antrian task berikutnya

Dicatat 22 Nov 2026 atas permintaan pemilik proyek, setelah task lokal M5 selesai. Urutan bukan prioritas; prioritas ditentukan pemilik proyek saat mengambil task.

**Lokal (bisa dikerjakan sekarang)**
- [ ] Site nyata pertama **Berita Konoha** (`beritakonoha`, domain beritakonoha.id dibeli pemilik proyek nanti; dev `beritakonoha.localhost`): portal informasi independen tentang berita politik pusat/daerah, bantuan sosial, tata cara surat pribadi dan perizinan, CPNS
  - [x] 22 Nov 2026: site dibuat dengan `site:create` (template news); 8 kategori, halaman Tentang Kami, Latihan Ujian CPNS (panduan SKD + sumber resmi), Kontak; menu header/footer; tema biru tua + beranda per rubrik — semua lewat CLI dan API admin, tanpa SQL. Domain dicek tersedia via RDAP (beritakonoha.id dan .com)
  - [x] 6 hasil AI contoh ("[Contoh]", panduan umum, dengan referensi resmi) ditulis sebagai `blog_agent` ke Antrian terbit; semuanya lolos pemeriksaan (peringatan: tag baru)
  - [ ] Pemilik proyek meninjau dan meng-approve/menolak contoh di Antrian terbit; hapus atau arsipkan contoh setelah agent menghasilkan konten asli
  - [ ] Domain asli: `pnpm site:domain --site beritakonoha --add beritakonoha.id --primary` setelah dibeli (bersama deploy)
  - [ ] Logo dan favicon site (upload media; belum ada layar admin untuk memasangnya, lihat di bawah)
- [x] Celah dari penyiapan Berita Konoha (dikerjakan 22 Nov 2026; pipeline hijau pada eeb9ed8):
  - [x] Tautan di halaman dan artikel: block `link` (http(s) dan `mailto:`) di body versi 2; v1 tetap sah tanpa migrasi; editor admin, template base, kontrak agent diperbarui. Halaman Latihan CPNS dan Kontak Berita Konoha kini memakai tautan
  - [x] Pengaturan site dari admin: nama, tagline, logo, favicon, pola judul, deskripsi dan gambar bagikan bawaan (`/admin/<site>/settings`); permalink baca-saja
  - [ ] Media sosial dan analytics: ada di skema settings tetapi belum dirender template; buka di form bila template menampilkannya
- [ ] Coba alur penuh dengan AI agent milik pemilik proyek: agent menulis ke `generated_articles` sesuai [docs/kontrak-agent.md](docs/kontrak-agent.md) (isi `AGENT_DB_PASSWORD`, `pnpm db:migrate`), hasil masuk Antrian terbit, approve, tayang dengan referensi; catat masalah kontrak yang ditemukan
- [ ] Adapter object storage (S3-compatible, uji lokal dengan MinIO) setelah pemilik proyek memilih provider
- [x] Dashboard pendapatan multi-sumber (ADR-011, 22 Nov 2026; permintaan pemilik proyek, spesifikasi docs/enhance-admin.md): tampilan awal superadmin di `/admin` (Dashboard, Sumber pemasukan, Situs, Transaksi, Impor file, Koneksi & log, Kurs), Admin Blog lewat tombol. Migration 0003 (ledger terpadu + 7 tabel pendukung, trigger revisi), adapter Lynk.id (webhook), Adsterra dan AdSense (API + mock), impor CSV/XLSX/JSON, input manual/adjustment/refund, headless (kerangka, nonaktif), `pnpm revenue:sync`, `pnpm revenue:demo`; gate:admin +7 pemeriksaan. Panduan: [docs/pendapatan.md](docs/pendapatan.md). Pipeline hijau pada 5bd09d2 (22 Nov 2026)
  - [ ] Kredensial asli + hapus data contoh + kurs resmi: lihat [docs/catatan-pendapatan.md](docs/catatan-pendapatan.md) (juga usulan lanjutan)

**Deploy (M5, ditahan sampai pemilik proyek memutuskan)**
- [ ] 5.0 Riset VPS, reverse proxy (TLS otomatis per domain), tujuan backup, alat monitoring → ADR-011
- [ ] 5.1 Dockerfile multi-stage + stage `tools`, `compose.prod.yml`, env produksi, image di CI
- [ ] 5.2 VPS dasar, TLS per domain + `ADMIN_HOST`, kontrak proxy (usulan H) teruji di CI, deploy dari CI dengan rollback
- [ ] 5.3 Backup terjadwal dan dikirim ke luar server
- [ ] 5.4 Cache di reverse proxy (kunci Host), gate paralel melewati cache
- [ ] 5.5 Notifikasi galat, uptime check eksternal, laporan ukuran database harian
- [ ] 5.6 Go-live site nyata, runbook `docs/operasional.md`, retro M5

---

## M5 — Produksi pertama (titik evaluasi)

> **Ditahan sejak 22 Nov 2026** atas keputusan pemilik proyek: semua task yang berkaitan dengan deploy (5.0, 5.1, 5.2, 5.3 bagian luar VPS, 5.4 bagian proxy, uptime check, 5.6) menunggu development lokal selesai. Task lokal (5.1b `site:create`, header cache di aplikasi, log JSON, skrip backup/restore yang diuji lokal) dikerjakan setelah M5a.

### Pemeriksaan poin yang ada (21 Nov 2026)

| Poin | Kondisi repo | Catatan |
|---|---|---|
| Deploy ke VPS dengan Docker; TLS | Hanya ada `docker-compose.yml` untuk dev (db, db-migrate, db-test, adminer); belum ada Dockerfile aplikasi. CI punya job `check`, `build`, `db`, tanpa deploy. | Multi-site berarti banyak domain, jadi sertifikat TLS harus otomatis per domain. `site.ts` membaca header Host, jadi reverse proxy wajib meneruskan Host asli. Migration harus jalan sebelum versi baru aplikasi start (usulan A, B). |
| Backup PostgreSQL otomatis + satu kali uji restore | Belum ada skrip backup. `integrity_test.sql` dan smoke test sudah ada dan bisa dipakai untuk memeriksa hasil restore. | Backup harus disimpan di luar VPS. File di `MEDIA_DIR` tidak ada di database, jadi ikut dibackup (usulan C). |
| Cache publik dengan TTL pendek; storage R2 bila media mulai banyak | HTML publik belum dikirim dengan header cache; 404 site `no-store`; feed 300 detik; media 86400 detik. Storage adapter baru disk lokal. | Kunci cache wajib memuat Host; tanpa itu isi site tertukar, kebalikan dari gate M2 (usulan D). TTL menjadi batas keterlambatan artikel terjadwal. Admin dan respons yang membawa cookie sesi tidak boleh di-cache. R2 tetap bersyarat; pemicunya perlu dinyatakan dengan angka. |
| Monitoring dasar: error, latency, ukuran database | `/api/health` sudah mengecek database. Log masih teks bebas ke stdout (`[page]`, `[site]`). | Latency dan error per site butuh log terstruktur. Alat (layanan hosted atau self-host) belum dipilih (usulan E). |
| Gate: satu site nyata live; restore backup berhasil | Domain, DNS, dan VPS harus disediakan pemilik proyek. | Bila evaluasi M3 menaruh M5 sebelum M4, konten site nyata diisi lewat seed atau SQL manual. |

### Pemeriksaan ulang setelah M4 (22 Nov 2026)

Tabel di atas ditulis sebelum M4. M4 menambah admin, sesi, upload, dan pratinjau. Akibatnya untuk produksi:

| Temuan di kode | Akibat di produksi | Ditangani di |
|---|---|---|
| Belum ada cara membuat site + domain selain `dev_seed.sql` (admin hanya mengelola isi site yang sudah ada; seed produksi tidak dijalankan) | Gate "satu site nyata live" hanya bisa lewat SQL manual, padahal gate M4 menetapkan tanpa SQL manual | Usulan G |
| `admin:create` dan `demo:saksang` jalan lewat `tsx` dari source workspace; image produksi hanya berisi `.output` | Admin pertama tidak bisa dibuat dari dalam container | Usulan G |
| Admin multi-site di `ADMIN_HOST` (dev `admin.localhost`) | Host admin butuh DNS dan TLS sendiri; endpoint "ask" on-demand TLS harus mengizinkan `ADMIN_HOST`, bukan hanya `site_domains` | Usulan A (diperluas) |
| Cek `Origin` dan atribut `Secure` cookie memakai `X-Forwarded-Proto`; IP rate limit login memakai entri terakhir `X-Forwarded-For` bila `TRUST_PROXY=true` | Tanpa `X-Forwarded-Proto: https`, semua POST admin ditolak 403 (origin `http` ≠ `https`). Tanpa `TRUST_PROXY`, semua klien terhitung satu IP (IP proxy): 30 percobaan gagal dari siapa pun mengunci login semua orang | Usulan H |
| Pembatas login (`login-throttle.ts`) dan draf pratinjau (`preview-drafts.ts`) disimpan di memori proses | Lebih dari satu replika aplikasi = batas login bisa dilewati dan pratinjau acak 404 | Usulan I |
| HTML publik belum punya header cache; mode `single` menaruh admin di domain site | Cache harus dilewati bila ada cookie `blog_admin`. Artikel yang diedit atau diterbitkan terlambat tampil paling lama TTL; `gate-admin` mengharuskan "langsung tampil", jadi gate itu tetap memukul aplikasi langsung, dan pemeriksaan lewat cache memakai toleransi TTL | Usulan D (diperluas) |
| `MEDIA_DIR` di disk lokal; `ADMIN_SESSION_SECRET` wajib | Media harus di volume dan ikut backup (sudah di C). Rotasi secret mengeluarkan semua admin; perlu tertulis di runbook | Usulan C, F |

### Usulan (menunggu persetujuan)

Usulan A–I untuk M5 ada di [docs/usulan-m4-m5.md](docs/usulan-m4-m5.md#m5--produksi-pertama). Rincian di bawah adalah draf yang memakai usulan itu; G–I ditambahkan 22 Nov 2026 setelah pemeriksaan ulang.

### Rincian (draf; disesuaikan setelah usulan disetujui)

**5.0 Riset dan keputusan infrastruktur [A] [E]**
- [ ] Bandingkan reverse proxy (TLS otomatis multi-domain), penyedia VPS, tujuan backup, dan alat monitoring; catat sebagai ADR-010
- [ ] [I] ADR-010 menetapkan satu replika aplikasi selama pembatas login dan draf pratinjau ada di memori
- › Skill: `anthropic-skills:deep-research` untuk perbandingan ini, dengan sumber yang dikutip di ADR

**5.1 Image dan konfigurasi produksi [A]**
- [ ] Dockerfile multi-stage untuk `apps/web` (hasil `.output`, user non-root, healthcheck `/api/health`)
- [ ] `compose.prod.yml`: app, db (port tidak dipublikasikan), migrate sekali jalan, reverse proxy
- [ ] Env produksi: secret hanya di VPS (termasuk `ADMIN_SESSION_SECRET`), aplikasi memakai role `blog_app` (bukan superuser), `SITE_MODE` sesuai site, `SEED_DEV_DATA` tidak di-set (compose dev memakai bawaan `true`)
- [ ] [G] Stage `tools` di Dockerfile yang sama (source workspace + tsx) untuk migrate, `admin:create`, `site:create`
- [ ] CI: build image + `/api/health` dari image itu

**5.1b Membuat site produksi tanpa SQL [G]**
- [x] CLI `pnpm site:create` (kode, nama, template, domain primary, mode) + `pnpm site:domain` (tambah/hapus alias); validasi template dan config lewat manifest — logika di `packages/core/src/site/provision.ts`; site baru: domain primary + alias (dinormalisasi seperti resolver), theme aktif dengan config kosong (default manifest), menu untuk semua lokasi yang dikenal template, penulis "Redaksi", OWNER opsional; `site:domain` juga memindahkan primary; "mode" tidak per site (SITE_MODE adalah config deploy, ADR-001)
- [x] Test CLI + dijalankan di gate CI terhadap database kosong hasil migrate — 11 test di `provision.test.ts`; job `build` membuat site `ci-baru` (magazine, baru.localhost) lewat CLI lalu smoke ikut memeriksanya; gate isolasi, admin, dan konten tetap lulus dengan site ketiga

**5.2 VPS, TLS, deploy [A] [B] [H]**
- [ ] VPS dasar: login SSH key saja, firewall 22/80/443, update keamanan otomatis
- [ ] Reverse proxy: TLS otomatis per domain (hanya domain di `site_domains` dan `ADMIN_HOST`), meneruskan Host asli
- [ ] [H] Kontrak proxy: `X-Forwarded-Proto`, `X-Forwarded-For` ditambahkan (bukan ditimpa klien), `TRUST_PROXY=true`; smoke di CI melewati proxy: login admin + satu POST lolos cek Origin, cookie `Secure`, rate limit memakai IP klien
- [ ] [B] Deploy dari CI (job manual): push image bertag commit → VPS pull → migrate → restart; rollback ke tag sebelumnya
- › Skill: `/security-review` pada Dockerfile, compose, konfigurasi proxy, dan job deploy

**5.3 Backup dan restore [C]**
- [ ] `pg_dump` terjadwal (format custom) + retensi, dikirim ke luar VPS; `MEDIA_DIR` ikut dibackup — bagian lokal selesai: `packages/db/scripts/backup.sh` (`pnpm db:backup`: dump + media + jumlah baris + SHA-256, retensi `BACKUP_KEEP`); penjadwalan dan pengiriman ke luar server menunggu deploy
- [x] Skrip restore ke database kosong, lalu `integrity_test.sql` + smoke — `restore.sh` (`pnpm db:restore`): hanya ke database baru, checksum, role, jumlah baris per tabel dibanding saat backup (bukan `integrity_test.sql`, yang bergantung pada data seed), jumlah file media; smoke aplikasi terhadap database hasil restore; bagian 8 `run_all.sh` di CI (84 pemeriksaan)
- [x] Uji restore sekali; catat tanggal, durasi, dan ukuran di TASKS.md — 22 Nov 2026, database dev (10 MB): dump 91.648 byte, media 5.843 byte (7 file), restore 4 detik (19 tabel, jumlah baris sama), smoke OK; restore ke database yang sudah ada dan backup yang diubah ditolak

**5.4 Cache publik [D]**
- [x] Header cache HTML publik dengan TTL pendek, hanya untuk respons tanpa cookie sesi (`blog_admin`); admin dan preview `no-store` — `apps/web/server/utils/cache-control.ts`: 200 = `public, max-age=0, s-maxage=<PUBLIC_CACHE_TTL>` (bawaan 60 detik), status lain `no-store`, cookie sesi `private, no-store`; RSS/sitemap memakai TTL yang sama (sebelumnya `max-age=300`); diperiksa di build produksi dan di gate admin (57 pemeriksaan)
- [ ] Cache di reverse proxy dengan kunci Host + path + query; gate paralel M2 dijalankan ulang melewati cache
- [ ] Test: artikel terjadwal tampil paling lambat TTL setelah `published_at` (gate M4 tetap memukul aplikasi langsung) — bagian aplikasi selesai (404 terjadwal `no-store`, `s-maxage` setelah terbit, di gate admin); pembuktian lewat cache menunggu proxy (deploy, ditahan)
- [ ] R2: tidak dikerjakan sampai pemicunya terpenuhi (angka ditetapkan di ADR-010); storage adapter sudah menjadi titik gantinya

**5.5 Monitoring [E]**
- [x] Log JSON per request: request id, site, path, status, durasi — `apps/web/server/utils/log.ts` + `server/plugins/request-log.ts` (juga method, host, header `x-request-id`; tanpa query string; health sukses tidak dicatat; request bergalat lewat hook `error`); 9 log teks bebas diganti log terstruktur
- [ ] Error → notifikasi ke pemilik proyek
- [ ] Latency p50/p95 per site dari log; ukuran database dan per tabel tiap hari — alatnya selesai: `log:report` (p50/p95/4xx/5xx per site) dan `pnpm db:size`; penjadwalan harian menunggu deploy
- [ ] Uptime check eksternal ke `/api/health` dan home setiap domain
- › Skill: `dataviz` bila latency dan ukuran database ditampilkan sebagai grafik

**5.6 Go-live dan penutup [F]**
- [ ] Domain + DNS site nyata dan host admin; site dibuat dengan `site:create`, admin dengan `admin:create`, konten awal lewat admin
- [ ] Cek produksi: canonical, sitemap, RSS, dan `robots.txt` memakai domain produksi
- [ ] [F] Runbook `docs/operasional.md`: deploy, rollback, restore, rotasi secret
- [ ] Bab tutorial, commit, retro mini M5, evaluasi backlog
- › Skill: `/security-review` dan `/code-review` (level high) untuk seluruh diff M5 sebelum go-live

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

## Skill Claude Code

Skill yang dipakai di rincian M3–M5. Semuanya dari Anthropic: skill bawaan Claude Code, `anthropic-skills`, dan plugin `frontend-design` dari marketplace resmi `anthropics/claude-plugins-official` (author: Anthropic).

| Skill | Dipakai di | Untuk |
|---|---|---|
| `/code-review` | Akhir setiap subbagian yang menyentuh core, template-kit, atau server; seluruh diff sebelum commit milestone | Mencari bug di diff. Level high sebagai default. Level max/ultra hanya bila diminta pemilik proyek (ultra berbayar dan dijalankan sendiri oleh pemilik proyek) |
| `/simplify` | Setelah fitur jalan, sebelum `/code-review` | Merapikan kode yang berulang atau berlapis; tidak mencari bug |
| `/security-review` | M4 (login, sesi, upload, API admin), M5 (Dockerfile, proxy, deploy) | Review keamanan perubahan di branch |
| `frontend-design:frontend-design` | M3 (section base, template news), M4 (UI admin, form tema) | Arah visual yang jelas dan tidak generik, tetap lewat token dan CSS (tanpa override komponen) |
| `/run` | Setiap perubahan yang terlihat di browser | Menjalankan app dan memeriksa perubahan di app sungguhan, bukan hanya test |
| `anthropic-skills:deep-research` | M5 (5.0) | Perbandingan reverse proxy, VPS, backup, dan monitoring dengan sumber, untuk ADR-010 |
| `dataviz` | M5 (5.5), bila ada grafik | Grafik latency dan ukuran database yang konsisten |

Usulan tambahan (menunggu persetujuan):
- **[S1] `/init` untuk membuat `CLAUDE.md`.** *Alasan:* repo belum punya `CLAUDE.md`; aturan kerja (TASKS.md sebagai daftar task, tutorial digenerate dari `tutorial.tpl.md`, `.localhost`, `pnpm check`/smoke/gate) sekarang hanya tersimpan di memori satu mesin. Dengan `CLAUDE.md`, sesi lain dan reviewer membaca aturan yang sama.
- **[S2] Skill proyek `/gate` lewat `anthropic-skills:skill-creator`.** *Alasan:* setiap penutupan subbagian mengulang urutan yang sama (`pnpm check`, build, smoke, gate, `pnpm tutorial --check`) dan urutannya bertambah di M3–M5 (gate admin, cek browser). Satu skill mencegah langkah terlewat.

Tidak dipakai: `docx`, `pptx`, `xlsx`, `pdf`, dan `google-workspace` (TASKS.md tidak disinkronkan ke guide), `claude-api` (baru relevan di item backlog AI), serta skill built-in browser, Chrome, dan computer use (tool-nya tidak tersedia di VS Code WSL; cek browser memakai skrip Playwright 3.4).

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
| Pulihkan revisi artikel (usulan M4-E) | Ada kebutuhan mengembalikan isi lama tanpa SQL | Ditunda pada persetujuan M4 21 Nov 2026; revisi tetap disimpan otomatis di M4 |
