# Task List — Framework Web Artikel Multi-Template

Sumber: Google Doc "Revisi Implementation Guide — Framework Web Artikel Multi-Template" (Drive, folder "Framework Web Artikel Multi-Template").
Diambil dari dokumen pada 19 Nov 2026. Sejak itu file ini menjadi daftar task kerja dan tidak disinkronkan lagi dengan dokumen.

## Ringkasan progres

| Milestone | Task selesai | Gate |
|---|---|---|
| M0 — Fondasi | 10 / 10 | ✅ Lulus 17 Nov 2026 — pipeline #3078334327 (commit 9df99b4) |
| M1 — Database v1 | 12 / 12 | ✅ Lulus 19 Nov 2026 — pipeline hijau (commit fea423a) |
| M2 — Tampilan pertama | 30 / 30 | ✅ Lulus 20 Nov 2026 — pipeline hijau (commit c312b05) |
| M3 — Template kedua (titik evaluasi) | 22 / 25 | — |
| M4 — Admin minimal | 0 / 27 | — (draf; usulan A–G menunggu persetujuan) |
| M5 — Produksi pertama (titik evaluasi) | 0 / 23 | — (draf; usulan A–F menunggu persetujuan) |

**Task berikutnya:** M3 3.4 (skrip cek browser) dan 3.5 (penutup); 3.0–3.3 selesai 21 Nov 2026. Rincian M4–M5 (21 Nov 2026) masih draf; usulannya ada di [docs/usulan-m4-m5.md](docs/usulan-m4-m5.md) dan ditinjau lagi pada evaluasi M3. Skill Claude Code per task: lihat [Skill Claude Code](#skill-claude-code).

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
- [x] Smoke dan gate paralel: kuliner `tpl-news` beserta marker news; tiga template dari satu server
- [x] Test arsitektur: entry `./manifest` tidak meng-import `.vue`/`.css` — `tests/template-manifest.test.ts`, menelusuri import tidak langsung, dengan test kontrol
- [ ] Skrip Playwright lokal di `apps/web/scripts/` (cek hidrasi + screenshot per domain), tidak di CI; cara pakai di `docs/dev-setup.md`
- › Skill: `/run` untuk menjalankan app dan skrip cek

**3.5 Penutup**
- [ ] Bab tutorial (`docs/tutorial/tutorial.tpl.md` + `pnpm tutorial`), dengan catatan di bab lama yang filenya berubah
- [ ] Commit, pipeline hijau, retro mini M3, evaluasi urutan M4/M5
- › Skill: `/code-review` (level high) untuk seluruh diff M3 sebelum commit

**Gate:** news selesai tanpa mengubah core, atau setiap perubahan core dicatat sebagai ADR perbaikan kontrak.
**Evaluasi:** apakah admin (M4) atau produksi dengan data seed/manual (M5) yang lebih dulu?

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

### Usulan (menunggu persetujuan)

Usulan A–G untuk M4 ada di [docs/usulan-m4-m5.md](docs/usulan-m4-m5.md#m4--admin-minimal). Rincian di bawah adalah draf yang memakai usulan itu.

### Rincian (draf; disesuaikan setelah usulan disetujui)

**4.0 Fondasi admin [A] [B] [G]**
- [ ] ADR-009: host admin, cara render (SPA), sesi cookie, library Argon2id; site middleware melewati `/admin` dan `/api/admin`
- [ ] Sesi cookie terenkripsi (secret dari env; `HttpOnly`, `SameSite=Lax`, `Secure` di produksi) dengan masa berlaku; tanpa tabel sesi
- [ ] Login dan logout dengan Argon2id; pesan gagal yang sama untuk email tidak ada dan password salah
- [ ] [B] CLI `pnpm admin:create`: email dari argumen, password dari prompt (bukan argumen), user `ACTIVE` + `site_members` `OWNER`
- [ ] Mode `multi` → pemilih site dari `site_members`; mode `single` → hanya site `SITE_CODE`
- [ ] Guard `/api/admin/*`: sesi valid + anggota site yang diminta
- [ ] [G] Rate limit login per IP + email; method non-GET wajib `Origin` yang sama dengan host admin
- [ ] Test: login benar/salah, sesi kedaluwarsa, user `DISABLED`, akses ke site yang bukan miliknya ditolak
- › Skill: `/security-review` setelah 4.0 selesai; `/code-review` (level high)

**4.1 Repository tulis di core**
- [ ] Buat, ubah, arsipkan: artikel, halaman, kategori, tag, menu; siteId wajib; body divalidasi skema block v1; `body_text` dari `extractBodyText`
- [ ] Optimistic locking lewat `version`; konflik → 409
- [ ] Slug unik per site, dibuat dari judul bila kosong
- [ ] Test isolasi site untuk operasi tulis (menulis ke baris site lain gagal)
- › Skill: `/code-review` (level high)

**4.2 Layar admin [A] [C]**
- [ ] Layout admin, daftar + form untuk artikel, halaman, kategori, tag, menu (tree)
- [ ] [C] Block editor 6 tipe block v1: tambah, ubah urutan, hapus; validasi di server tetap jadi sumber kebenaran
- [ ] Status `DRAFT`/`REVIEW`/`PUBLISHED`/`ARCHIVED`; tanggal terbit diisi dalam `site.timezone`, disimpan UTC
- › Skill: `frontend-design:frontend-design` untuk UI admin (layout, form, block editor); `/run` untuk mencoba alurnya di browser

**4.3 Media**
- [ ] Storage adapter sisi tulis (disk lokal, `MEDIA_DIR`); `storage_key` dibuat server
- [ ] Upload: tipe dari magic bytes (JPEG, PNG, WebP; SVG ditolak), batas ukuran, dimensi, alt text
- [ ] Pemilih media untuk block gambar dan cover artikel
- › Skill: `/security-review` (upload adalah input paling berisiko di M4)

**4.4 Pengaturan tema [D]**
- [ ] Form dari skema manifest: tokens, options, layout per section
- [ ] [D] Preview config draf tanpa mengubah theme aktif
- [ ] Simpan: validasi, lalu tulis config dalam versi template terpasang
- › Skill: `frontend-design:frontend-design` untuk form token (warna, font) dan panel preview

**4.5 Revisi dan redirect [E]**
- [ ] Setiap update artikel: snapshot ke `article_revisions` dalam transaksi yang sama, `version` naik
- [ ] Slug artikel atau halaman yang pernah terbit berubah → redirect 301 dari path lama; rantai diratakan; redirect yang menunjuk ke dirinya sendiri dihapus
- [ ] Daftar revisi per artikel
- [ ] [E] Pulihkan revisi (menjadi update baru, riwayat tidak ditimpa)

**4.6 Test pembukti gate dan penutup [F]**
- [ ] [F] Skrip gate `apps/web/scripts/gate-admin.mjs`, masuk CI job `build`: login → buat artikel → jadwalkan `published_at` beberapa detik ke depan → sebelum waktunya 404 dan tidak ada di home, sitemap, RSS → sesudahnya tampil
- [ ] Bab tutorial, commit, pipeline hijau, retro mini M4
- › Skill: `/security-review` dan `/code-review` (level high) untuk seluruh diff M4 sebelum commit

**Gate:** satu artikel dibuat, dijadwalkan, dan tampil tepat waktu tanpa menyentuh database manual.

## M5 — Produksi pertama (titik evaluasi)

### Pemeriksaan poin yang ada (21 Nov 2026)

| Poin | Kondisi repo | Catatan |
|---|---|---|
| Deploy ke VPS dengan Docker; TLS | Hanya ada `docker-compose.yml` untuk dev (db, db-migrate, db-test, adminer); belum ada Dockerfile aplikasi. CI punya job `check`, `build`, `db`, tanpa deploy. | Multi-site berarti banyak domain, jadi sertifikat TLS harus otomatis per domain. `site.ts` membaca header Host, jadi reverse proxy wajib meneruskan Host asli. Migration harus jalan sebelum versi baru aplikasi start (usulan A, B). |
| Backup PostgreSQL otomatis + satu kali uji restore | Belum ada skrip backup. `integrity_test.sql` dan smoke test sudah ada dan bisa dipakai untuk memeriksa hasil restore. | Backup harus disimpan di luar VPS. File di `MEDIA_DIR` tidak ada di database, jadi ikut dibackup (usulan C). |
| Cache publik dengan TTL pendek; storage R2 bila media mulai banyak | HTML publik belum dikirim dengan header cache; 404 site `no-store`; feed 300 detik; media 86400 detik. Storage adapter baru disk lokal. | Kunci cache wajib memuat Host; tanpa itu isi site tertukar, kebalikan dari gate M2 (usulan D). TTL menjadi batas keterlambatan artikel terjadwal. Admin dan respons yang membawa cookie sesi tidak boleh di-cache. R2 tetap bersyarat; pemicunya perlu dinyatakan dengan angka. |
| Monitoring dasar: error, latency, ukuran database | `/api/health` sudah mengecek database. Log masih teks bebas ke stdout (`[page]`, `[site]`). | Latency dan error per site butuh log terstruktur. Alat (layanan hosted atau self-host) belum dipilih (usulan E). |
| Gate: satu site nyata live; restore backup berhasil | Domain, DNS, dan VPS harus disediakan pemilik proyek. | Bila evaluasi M3 menaruh M5 sebelum M4, konten site nyata diisi lewat seed atau SQL manual. |

### Usulan (menunggu persetujuan)

Usulan A–F untuk M5 ada di [docs/usulan-m4-m5.md](docs/usulan-m4-m5.md#m5--produksi-pertama). Rincian di bawah adalah draf yang memakai usulan itu.

### Rincian (draf; disesuaikan setelah usulan disetujui)

**5.0 Riset dan keputusan infrastruktur [A] [E]**
- [ ] Bandingkan reverse proxy (TLS otomatis multi-domain), penyedia VPS, tujuan backup, dan alat monitoring; catat sebagai ADR-010
- › Skill: `anthropic-skills:deep-research` untuk perbandingan ini, dengan sumber yang dikutip di ADR

**5.1 Image dan konfigurasi produksi [A]**
- [ ] Dockerfile multi-stage untuk `apps/web` (hasil `.output`, user non-root, healthcheck `/api/health`)
- [ ] `compose.prod.yml`: app, db (port tidak dipublikasikan), migrate sekali jalan, reverse proxy
- [ ] Env produksi: secret hanya di VPS, aplikasi memakai role `blog_app` (bukan superuser), `SITE_MODE` sesuai site
- [ ] CI: build image + `/api/health` dari image itu

**5.2 VPS, TLS, deploy [A] [B]**
- [ ] VPS dasar: login SSH key saja, firewall 22/80/443, update keamanan otomatis
- [ ] Reverse proxy: TLS otomatis per domain (hanya domain yang ada di `site_domains`), meneruskan Host asli
- [ ] [B] Deploy dari CI (job manual): push image bertag commit → VPS pull → migrate → restart; rollback ke tag sebelumnya
- › Skill: `/security-review` pada Dockerfile, compose, konfigurasi proxy, dan job deploy

**5.3 Backup dan restore [C]**
- [ ] `pg_dump` terjadwal (format custom) + retensi, dikirim ke luar VPS; `MEDIA_DIR` ikut dibackup
- [ ] Skrip restore ke database kosong, lalu `integrity_test.sql` + smoke
- [ ] Uji restore sekali; catat tanggal, durasi, dan ukuran di TASKS.md

**5.4 Cache publik [D]**
- [ ] Header cache HTML publik dengan TTL pendek, hanya untuk respons tanpa cookie sesi; admin dan preview `no-store`
- [ ] Cache di reverse proxy dengan kunci Host + path + query; gate paralel M2 dijalankan ulang melewati cache
- [ ] Test: artikel terjadwal tampil paling lambat TTL setelah `published_at`
- [ ] R2: tidak dikerjakan sampai pemicunya terpenuhi (angka ditetapkan di ADR-010); storage adapter sudah menjadi titik gantinya

**5.5 Monitoring [E]**
- [ ] Log JSON per request: request id, site, path, status, durasi
- [ ] Error → notifikasi ke pemilik proyek
- [ ] Latency p50/p95 per site dari log; ukuran database dan per tabel tiap hari
- [ ] Uptime check eksternal ke `/api/health` dan home setiap domain
- › Skill: `dataviz` bila latency dan ukuran database ditampilkan sebagai grafik

**5.6 Go-live dan penutup [F]**
- [ ] Domain + DNS site nyata, konten awal (lewat admin bila M4 sudah selesai)
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
