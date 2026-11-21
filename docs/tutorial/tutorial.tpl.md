# Menyiapkan Komputer Kerja

1. Gunakan Linux, macOS, atau Windows dengan WSL2. Semua perintah di buku ini dijalankan dari terminal Linux (bash).
2. Pasang Node.js 24 (LTS). Periksa dengan `node --version`; hasilnya harus `v24.x`.
3. Pasang Docker Engine beserta plugin Compose (di Windows: Docker Desktop dengan integrasi WSL). Periksa dengan `docker compose version`.
4. Aktifkan pnpm lewat corepack, tanpa memasang pnpm secara global:

```bash
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
corepack enable pnpm
pnpm --version
```

5. Simpan `export COREPACK_ENABLE_DOWNLOAD_PROMPT=0` di `~/.bashrc`. Tanpa variabel ini, perintah `corepack` pertama kali akan menunggu konfirmasi unduhan dan terminal terlihat macet.
6. Anda tidak perlu memasang `psql` di komputer. Migration dan test database dijalankan di dalam container PostgreSQL.
7. Opsional: pasang Git dan editor VS Code. Bila memakai VS Code, ekstensi PostgreSQL (`ms-ossdata.vscode-pgsql`) memudahkan melihat isi database. Koneksinya bisa disimpan di `.vscode/settings.json` tanpa password:

@@include .vscode/settings.json json@@

# Membangun Monorepo dengan pnpm Workspace

1. Buat repository Git baru, lalu clone ke komputer. Semua langkah berikut dijalankan dari root repository.
2. Rancang struktur folder. Satu aplikasi Nuxt, beberapa paket pendukung, dan beberapa template:

```text
apps/
  web/              Nuxt: public site + /admin + server/api
packages/
  db/               migration SQL, test integritas, schema Drizzle
  core/             domain: repository data, validasi Zod, block body, view model
  template-kit/     kontrak template: defineTemplate, tipe view model, token -> CSS variable
templates/
  base/             semua komponen UI default
  magazine/         template pertama
  news/             template kedua, pembuktian kontrak
docs/
  dev-setup.md      setup development
  adr/              catatan keputusan arsitektur
tests/              test lintas paket (arsitektur, CI)
```

3. Pegang satu aturan arah dependency sejak awal: `templates/*` hanya boleh import `@framework/template-kit` dan `@framework/template-base`, tidak pernah `core` atau `db`. Aturan ini yang menjaga template tetap bisa ditukar. Nanti aturan ini dipasang di ESLint dan diuji.
4. Kunci versi Node untuk semua orang dan CI dengan file `.nvmrc`:

@@include .nvmrc text@@

5. Daftarkan folder workspace di `pnpm-workspace.yaml`. Bagian `allowBuilds` baru dibutuhkan saat Nuxt dipasang (bab aplikasi web): pnpm 12 tidak menjalankan build script dependency kecuali diizinkan satu per satu:

@@include pnpm-workspace.yaml yaml@@

6. Buat `package.json` di root. `packageManager` membuat corepack memakai versi pnpm yang sama di semua mesin. Script `db:*` membungkus Docker Compose agar Anda tidak perlu menghafal perintahnya. Script `lint`, `typecheck`, dan `test` baru berguna setelah bab TypeScript/ESLint/Vitest, sedangkan `dev` dan `build` setelah bab aplikasi web, tetapi bentuk akhirnya seperti ini:

@@include package.json json@@

7. Buat `package.json` minimal untuk setiap paket yang belum berisi kode. Semua nama paket memakai scope `@framework/`:

`apps/web/package.json` (isi awal; dependency Nuxt ditambah di bab aplikasi web)

```json
{
  "name": "@framework/web",
  "version": "0.0.0",
  "private": true,
  "description": "Nuxt: public site + /admin + server/api"
}
```

`packages/template-kit/package.json` (isi awal; dilengkapi di bab "Membangun Sistem Template")

```json
{
  "name": "@framework/template-kit",
  "version": "0.0.0",
  "private": true,
  "description": "Kontrak template: defineTemplate, tipe view model, token -> CSS variable"
}
```

`templates/base/package.json` (isi awal; dilengkapi di bab "Membangun Sistem Template")

```json
{
  "name": "@framework/template-base",
  "version": "0.0.0",
  "private": true,
  "description": "Semua komponen UI default; dipakai bersama oleh semua template"
}
```

`templates/magazine/package.json` (isi awal; dilengkapi di bab "Membangun Sistem Template")

```json
{
  "name": "@framework/template-magazine",
  "version": "0.0.0",
  "private": true,
  "description": "Template pertama"
}
```

@@include templates/news/package.json json@@

8. Buat `.gitignore`. Bagian penting: `.env` tidak boleh masuk Git (kecuali `.env.example`), hasil build Nuxt diabaikan, dan `.vscode/settings.json` sengaja tidak diabaikan. Dua baris terakhir (`!scripts/`, `!seed/`) memastikan folder itu tetap masuk Git walau gitignore global Anda mengabaikannya:

@@include .gitignore gitignore@@

9. Jalankan `pnpm install` agar `pnpm-lock.yaml` terbentuk, lalu commit.

# Menjalankan PostgreSQL 18 dengan Docker Compose

1. Pilih PostgreSQL 18. Versi ini punya fungsi `uuidv7()` bawaan. UUIDv7 berurutan waktu, jadi index primary key lebih rapat dibanding UUIDv4.
2. Pisahkan dua role database sejak awal:
   - Pemilik schema (`blog`) dipakai migration, test, dan tool admin.
   - Role aplikasi (`blog_app`) dipakai Nuxt. Role ini hanya boleh SELECT/INSERT/UPDATE/DELETE, tanpa DDL.
   Pemisahan ini membatasi dampak bila aplikasi bocor, dan menjadi prasyarat RLS di kemudian hari.
3. Buat `.env.example` sebagai contoh konfigurasi. File ini masuk Git; isinya hanya placeholder. Bagian `SITE_MODE` baru dipakai di bab "Memilih Site dari Domain Request":

@@include .env.example dotenv@@

4. Salin menjadi `.env` (`cp .env.example .env`), lalu ganti kedua password. Samakan password di `DATABASE_URL` dengan `APP_DB_PASSWORD`.
5. Tulis `docker-compose.yml` dengan empat service:
   - `db`: PostgreSQL 18.7, zona waktu server UTC, log query yang lebih lambat dari 250 ms, port hanya dibuka ke `127.0.0.1`.
   - `db-migrate`: berjalan sekali setiap `up`, menjalankan migration lalu membuat role aplikasi. Aman diulang.
   - `db-test` (profile `test`): uji lengkap database di database terpisah.
   - `adminer` (profile `tools`): UI database opsional.

@@include docker-compose.yml yaml@@

6. Perhatikan path volume. Mulai PostgreSQL 18, volume dipasang di `/var/lib/postgresql`, bukan `/var/lib/postgresql/data` seperti panduan untuk versi 17 ke bawah.
7. Perhatikan cara password dibaca. Password di `.env` hanya dibaca saat volume pertama kali dibuat. Mengubahnya setelah itu tidak mengganti password role `blog`; pakai `docker compose down -v` (data dev hilang) atau `ALTER ROLE`. Password `blog_app` selalu disinkronkan ulang oleh `db-migrate`.
8. Aplikasi Nuxt nantinya dijalankan di host dengan `pnpm dev`, bukan di container, agar hot reload cepat.
9. Tulis panduan singkat untuk diri sendiri di `docs/dev-setup.md`:

@@include docs/dev-setup.md markdown@@

# Merancang Schema Database Multi-Site

1. Tetapkan model tenant: satu baris `sites` = satu website. Satu schema dipakai dalam dua mode deploy:
   - Single-site: satu database per produk, site dipilih lewat env `SITE_CODE`.
   - Multi-site: satu database bersama, site dipilih dari Host request lewat `site_domains`.
   Karena semua primary key UUID, satu site bisa dipindah antar database dengan menyalin baris ber-`site_id` yang sama tanpa bentrok ID.
2. Tetapkan konvensi sebelum menulis tabel:
   - Primary key UUIDv7, dibuat database (`DEFAULT uuidv7()`).
   - Setiap tabel milik site punya `site_id NOT NULL` dan `UNIQUE (site_id, id)` sebagai target composite FK.
   - Relasi antar tabel milik site selalu lewat composite FK `(site_id, x_id) → (site_id, id)`. Dengan begitu database sendiri yang menolak relasi lintas site, bukan hanya aplikasi.
   - FK opsional memakai `ON DELETE SET NULL (kolom)`: hanya kolom rujukan yang dikosongkan, `site_id` tetap. Fitur ini butuh PostgreSQL 15+.
   - Status disimpan sebagai `text` + `CHECK`, bukan `ENUM`, agar nilai baru cukup ditambah lewat migration.
   - JSONB dipakai untuk bentuk yang ditentukan aplikasi atau template (`settings`, `tokens`, `layouts`, `seo`, `attributes`, `body`). Database hanya menjaga bentuk luarnya (harus object); isinya divalidasi Zod di aplikasi.
   - Semua waktu `timestamptz` (disimpan UTC); `updated_at` diisi trigger.
   - Domain dan slug wajib sudah dinormalisasi; `CHECK` menolak huruf besar, protokol, port, dan spasi.
3. Kelompokkan 16 tabel:

| Kelompok | Tabel | Aturan penting |
|---|---|---|
| Site | `sites` | `code` unik; `settings` JSONB; logo/favicon harus media site itu sendiri |
| Site | `site_domains` | Domain unik global; maksimal satu primary per site |
| Site | `site_themes` | Unik (site, template); maksimal satu aktif per site; versi semver |
| Akses | `users` | Email unik dan huruf kecil; `is_superadmin` untuk mode semua site |
| Akses | `site_members` | Role OWNER, EDITOR, AUTHOR; permission di kode |
| Konten | `media` | `storage_key` (bukan URL); titik fokus untuk crop per template |
| Konten | `authors` | Byline publik; boleh tanpa akun, bila tertaut user harus anggota site |
| Konten | `categories` | Bertingkat; slug unik per site; parent harus satu site |
| Konten | `tags` | Slug unik per site |
| Konten | `articles` | Slug unik per site; body `{version, blocks}`; `version` untuk optimistic locking |
| Konten | `article_tags` | Artikel dan tag wajib satu site |
| Konten | `article_revisions` | Snapshot lengkap; `revision_no` = `articles.version` |
| Konten | `pages` | `view_key` memilih varian view template |
| Navigasi | `menus` | Unik (site, location) |
| Navigasi | `menu_items` | Target bertipe dengan FK nyata; URL `javascript:` dan `//host` ditolak |
| Navigasi | `redirects` | Unik (site, from_path) |

4. Catat keputusan desain yang memengaruhi kode nanti:
   - Jadwal terbit tanpa queue: artikel terjadwal = `PUBLISHED` dengan `published_at` di masa depan. Query publik selalu memfilter `published_at <= now()`.
   - Ganti template tidak menghapus config: setiap template punya barisnya sendiri di `site_themes`; mengaktifkan template lain hanya memindah `is_active`.
   - `attributes` adalah titik ekstensi per topik (rating untuk site review, waktu masak untuk site resep) tanpa migration.
   - Pencarian memakai konfigurasi `simple`, bukan `indonesian`. Stemmer `indonesian` keliru untuk sebagian kata ("memasak" menjadi "pasak"). `body_text` diisi aplikasi dengan teks polos hasil ekstraksi block.
   - Siklus kategori lebih dari satu level (A → B → A) dicegah di aplikasi; database hanya menolak kategori menjadi parent dirinya sendiri.
   - Site produksi diarsipkan (`ARCHIVED`), bukan dihapus.
5. Tulis semuanya sebagai SQL tangan di `packages/db/migrations/0001_core.sql`. Jangan tulis `BEGIN`/`COMMIT` di dalamnya; runner di bab berikutnya yang membungkus transaksi. Bagian 0 membuat shim `uuidv7()` hanya bila server lebih tua dari PostgreSQL 18:

@@include packages/db/migrations/0001_core.sql sql@@

6. Tabel yang sengaja ditunda dan baru ditambah lewat migration baru saat dibutuhkan: `sessions` (auth), `audit_logs` (lebih dari satu admin), tabel AI, `publishing_logs` (queue/scheduler), `roles`/`permissions` (role di kode tidak lagi cukup), dan policy RLS.

# Menulis Runner Migration dan Role Aplikasi

1. Tulis runner migration sendiri dalam POSIX sh, sekitar 80 baris, tanpa tool tambahan. Aturannya:
   - File di `migrations/` dijalankan berurutan nama (`0001_`, `0002_`, ...).
   - Setiap file beserta catatannya di `schema_migrations` berjalan dalam satu transaksi.
   - Checksum SHA-256 disimpan. File yang sudah dijalankan lalu diubah ditolak, karena migration bersifat append-only.
   - File yang berisi `BEGIN`/`COMMIT` ditolak.

@@include packages/db/scripts/migrate.sh sh@@

2. Tulis SQL role aplikasi. File ini idempotent: membuat role bila belum ada, lalu selalu menyetel ulang password dan hak aksesnya. `ALTER DEFAULT PRIVILEGES` memastikan tabel dari migration berikutnya otomatis bisa diakses. Tabel `schema_migrations` dicabut dari role aplikasi:

@@include packages/db/scripts/app_role.sql sql@@

3. Bungkus dengan skrip shell yang mengirim nama dan password role sebagai variabel psql:

@@include packages/db/scripts/app_role.sh sh@@

4. Tulis skrip pemuat data contoh. Skrip ini hanya menjalankan setiap file `seed/*.sql`; isi data contohnya Anda tulis sendiri sesuai kebutuhan, dan setiap file seed harus idempotent (mis. `INSERT ... ON CONFLICT DO NOTHING`). Jangan pernah jalankan di produksi:

@@include packages/db/scripts/seed.sh sh@@

5. Tulis entry point service `db-migrate` yang merangkai ketiganya:

@@include packages/db/scripts/setup.sh sh@@

6. Nyalakan stack dan periksa hasilnya:

```bash
docker compose up -d
docker compose logs db-migrate     # harus berakhir dengan "database blog_dev siap"
```

7. Untuk menambah perubahan schema di kemudian hari: buat file baru `packages/db/migrations/0002_deskripsi.sql`, jalankan `pnpm db:migrate`, lalu `pnpm db:pull` (bab Drizzle). Jangan pernah mengedit file migration yang sudah dijalankan.

# Menguji Integritas Database

1. Setiap aturan di database harus punya test yang gagal bila aturan itu dilanggar. Tulis test dalam SQL murni di `packages/db/tests/integrity_test.sql`. Seluruh file berjalan dalam satu transaksi lalu `ROLLBACK`, jadi data tidak berubah.
2. Siapkan tiga helper di awal file: "SQL ini harus gagal dengan SQLSTATE tertentu", "kondisi ini harus benar", dan "rencana query harus memakai index tertentu".
3. Kelompokkan 42 test:

| Kelompok | Jumlah | Contoh |
|---|---|---|
| Relasi lintas site ditolak | 10 | Artikel site B memakai kategori site A; logo site memakai media site lain |
| Keunikan dan format | 11 | Domain huruf besar, protokol, port; dua theme aktif; slug sama di site berbeda diterima |
| Status dan isi | 7 | PUBLISHED tanpa tanggal; body tanpa blocks; menu `javascript:` dan `//host` |
| ON DELETE dan trigger | 6 | Hapus media → `featured_media_id` NULL, `site_id` tetap; kategori berisi artikel tidak bisa dihapus |
| Query publik | 3 | Feed tanpa draft dan artikel terjadwal; pencarian |
| Hard delete site | 1 | Tidak ada baris tersisa |
| Index pada 100.000 artikel | 4 | Feed, listing kategori, pencarian, cek slug |

4. Test ini membaca dua site contoh (site A dan site B) dari data seed Anda. Sesuaikan UUID di bagian atas file dengan data seed yang Anda tulis:

@@include packages/db/tests/integrity_test.sql sql@@

5. Tulis `run_all.sh` yang menguji seluruh paket database dari database kosong, dengan total 50 pemeriksaan:
   - migration dijalankan dua kali (run kedua harus melewati semua file),
   - runner harus menolak migration yang diubah,
   - role aplikasi dibuat,
   - seed dijalankan dua kali (jumlah baris harus sama),
   - 42 test integritas,
   - role aplikasi bisa baca/tulis tetapi tidak bisa membuat tabel, menghapus tabel, atau membaca `schema_migrations`.
6. `APP_DB_PASSWORD` wajib dan sengaja tidak punya default. Role PostgreSQL berlaku untuk seluruh server, jadi password yang dipasang skrip ini juga menjadi password `blog_app` milik database dev. Default yang berbeda dari `.env` akan diam-diam merusak koneksi aplikasi.

@@include packages/db/run_all.sh bash@@

7. Jalankan:

```bash
docker compose --profile test run --rm db-test
# harus berakhir dengan "SELESAI: semua pemeriksaan lulus"
```

# Menyiapkan TypeScript, ESLint, dan Vitest

1. Pasang tooling di root:

```bash
pnpm add -Dw typescript@~6.0.3 @types/node@^24.19.2 eslint@^10.15.0 @eslint/js@^10.0.1 \
  typescript-eslint@~8.72.2 globals@^17.14.0 vitest@^5.1.0
```

2. Buat `tsconfig.base.json` mode strict yang dipakai semua paket. Opsi `noUncheckedIndexedAccess` dan `noPropertyAccessFromIndexSignature` membuat akses ke array dan JSON lebih jujur:

@@include tsconfig.base.json jsonc@@

3. Buat `tsconfig.json` root untuk typecheck config tooling, test lintas paket, dan seluruh kode paket. Aplikasi Nuxt nanti memakai tsconfig dari Nuxt:

@@include tsconfig.json jsonc@@

4. Tulis `eslint.config.js` (flat config). Bagian terpenting adalah aturan `no-restricted-imports`:
   - File di `templates/**` hanya boleh import `@framework/template-kit` dan `@framework/template-base`. Import core, db, driver database, atau path relatif ke `apps/`/`packages/` ditolak.
   - `packages/template-kit` tidak boleh bergantung pada core atau database.
   - File schema hasil generate (bab Drizzle) tidak di-lint.
   - Blok untuk file `.vue` (`eslint-plugin-vue`) baru dipasang di bab "Memeriksa Komponen Vue dengan ESLint dan vue-tsc". Lewati dulu blok itu bila Anda mengikuti urutan bab.

@@include eslint.config.js js@@

5. Buat `vitest.config.ts`. Config ini ikut membaca `.env` lokal, sehingga test yang butuh database menemukan `DATABASE_URL`. Di mesin tanpa `.env`, test database otomatis dilewati. Plugin Vue baru ditambahkan di bab "Membangun Sistem Template":

@@include vitest.config.ts ts@@

6. Tulis test pertama, yaitu test arsitektur. Test ini memastikan aturan import di ESLint benar-benar menolak template yang mengakses data dan tetap mengizinkan import yang sah. Tanpa test ini, aturan ESLint bisa rusak diam-diam. Kasus komponen `.vue` ditambahkan di bab Vue, dan aturan kode `app/` di bab "Membangun Sistem Template":

@@include tests/architecture.test.ts ts@@

7. Jalankan `pnpm check` (lint + typecheck + test). Semuanya harus hijau sebelum lanjut.

# Mencatat Keputusan Arsitektur dengan ADR

1. Karena dikerjakan sendirian tanpa reviewer, keputusan yang mahal diubah ditulis sebagai ADR (Architecture Decision Record) di `docs/adr/NNN-judul.md`. Cukup lima bagian: Konteks, Keputusan, Alternatif yang ditolak, Konsekuensi, Status.
2. Buat indeks ADR. ADR-006 dan ADR-007 ditambahkan di bab "Membangun Halaman Publik dari View Model":

@@include docs/adr/README.md markdown@@

3. ADR-001, mode deploy. Satu schema, dua mode, dan konsekuensinya: repository tetap wajib menerima `siteId` walau berjalan di mode single-site, dan tidak boleh ada global state di SSR:

@@include docs/adr/001-mode-deploy.md markdown@@

4. ADR-002, satu aplikasi Nuxt tanpa NestJS. Logika domain ada di `packages/core` yang tidak bergantung pada Nuxt, agar bisa dipindah ke server lain bila suatu saat perlu:

@@include docs/adr/002-nuxt-tanpa-nestjs.md markdown@@

5. ADR-003, migration ditulis SQL tangan:

@@include docs/adr/003-migration-sql-tangan.md markdown@@

6. ADR-004, versi Drizzle. Periksa kanal rilis di npm saat Anda membaca ini, karena versinya mungkin sudah berubah:

@@include docs/adr/004-versi-drizzle.md markdown@@

7. ADR-005, kontrak template: komponen sama, tampilan berbeda:

@@include docs/adr/005-kontrak-template.md markdown@@

# Menghubungkan Aplikasi ke Database dengan Drizzle

1. Drizzle hanya dipakai sebagai query builder bertipe. Arah alirannya: SQL migration → database → schema TypeScript (lewat `drizzle-kit pull`). Jangan pernah memakai `drizzle-kit generate`, `migrate`, atau `push`.
2. Ubah `packages/db/package.json`: pasang `drizzle-orm` dan `drizzle-kit` dengan versi persis (tanpa `^`, sesuai ADR-004), driver `pg`, dan script `pull`:

@@include packages/db/package.json json@@

3. Beri paket ini `tsconfig.json` sendiri:

@@include packages/db/tsconfig.json json@@

4. Tulis `drizzle.config.ts`. Config ini dipakai hanya untuk `pull`, membaca `DATABASE_URL` dari `.env` root, mengabaikan `schema_migrations`, dan menghasilkan nama kolom camelCase:

@@include packages/db/drizzle.config.ts ts@@

5. `drizzle-kit pull` juga menulis `migration.sql` dan snapshot. Keduanya tidak dipakai, jadi bungkus perintahnya dengan skrip yang hanya menyalin `schema.ts` dan `relations.ts` ke `src/schema/`, menambah header "jangan diedit tangan", lalu membuang sisanya:

@@include packages/db/scripts/pull-schema.mjs js@@

6. Jalankan `pnpm db:pull`. Hasilnya `packages/db/src/schema/schema.ts` dan `relations.ts`. Kedua file ini hasil generate; buat ulang setiap kali ada migration baru, jangan diedit tangan.
7. Periksa hasil generate. `ON DELETE SET NULL (kolom)` tertulis di schema Drizzle sebagai `"set null"` saja. Ini aman karena constraint ditegakkan database, dan schema Drizzle tidak pernah dipakai untuk membuat migration. Tulis test yang memastikan composite FK dan partial index terbaca benar:

@@include packages/db/src/schema/schema.test.ts ts@@

8. Tulis pembuat koneksi. Tidak ada singleton di sini: pemanggil (aplikasi) yang menyimpan satu instance per proses dan menutup pool saat shutdown:

@@include packages/db/src/client.ts ts@@

9. Tulis entry point paket (file di bawah sudah memuat operator tambahan `ne`, `like`, dan `notInArray` dari bab-bab berikutnya). Operator query (`eq`, `and`, ...) diekspor ulang dari sini, sehingga hanya paket `db` yang bergantung langsung pada `drizzle-orm` dan hanya ada satu salinan Drizzle saat runtime:

@@include packages/db/src/index.ts ts@@

10. Test koneksi memastikan aplikasi terhubung sebagai `blog_app` (bukan pemilik schema) dan query relasional lewat composite FK berjalan. Test yang butuh database dilewati bila `DATABASE_URL` tidak ada:

@@include packages/db/src/client.test.ts ts@@

# Memvalidasi Konten dengan Zod

1. Buat paket `packages/core` untuk logika domain. Paket ini bergantung pada `@framework/db` dan Zod 4. Dependency `@framework/template-kit` dan subpath `./media` ditambahkan di bab "Membangun Sistem Template":

@@include packages/core/package.json json@@

@@include packages/core/tsconfig.json json@@

2. Definisikan body artikel sebagai daftar block bertipe, versi 1, dengan enam tipe: paragraph, heading, image, quote, list, embed. Aturan pentingnya:
   - Heading dimulai dari level 2, karena level 1 dipakai judul artikel.
   - Gambar merujuk `mediaId`, bukan URL.
   - Embed dibatasi ke penyedia yang dikenal dengan URL https; template membangun iframe sendiri dan tidak pernah menerima HTML mentah.
   - Ada dua cara membaca body. `parseBody` ketat dan dipakai saat menyimpan. `parseBodyLenient` dipakai saat render: block yang rusak atau tidak dikenal dilewati dan dilaporkan, sehingga halaman tidak crash.

@@include packages/core/src/content/blocks.ts ts@@

@@include packages/core/src/content/blocks.test.ts ts@@

3. Tulis `extractBodyText()` untuk mengisi kolom `articles.body_text`, yang dipakai indeks pencarian. Caption gambar, sumber kutipan, dan embed tidak ikut. Blok `default` dengan tipe `never` membuat typecheck gagal bila tipe block baru ditambah tanpa ditangani di sini:

@@include packages/core/src/content/extract-body-text.ts ts@@

@@include packages/core/src/content/extract-body-text.test.ts ts@@

4. Definisikan skema `sites.settings`: tagline, pola permalink (wajib memuat `:slug`; token lain `:category`, `:year`, `:month`), SEO default (`titleTemplate` wajib memuat `%s`), link sosial (hanya https), dan ID analytics. Key yang tidak dikenal dibuang, bukan membuat validasi gagal, agar data lama tetap terbaca:

@@include packages/core/src/site/settings.ts ts@@

@@include packages/core/src/site/settings.test.ts ts@@

5. Tulis test konsistensi yang membaca database (versi di bawah dibatasi ke dua site seed; alasannya di bab "Menyimpan Konten dari Admin"): semua body di database lolos skema block, `body_text` sama dengan hasil `extractBodyText(body)`, dan settings setiap site lolos skema. Test ini menangkap data seed atau data lama yang tidak lagi cocok dengan aturan aplikasi:

@@include packages/core/src/content/seed-consistency.test.ts ts@@

# Membangun Repository Data yang Terisolasi per Site

1. Tetapkan aturan repository sebelum menulis query:
   - Setiap fungsi menerima `siteId` sebagai argumen pertama. Satu-satunya pengecualian adalah resolver site (`findByDomain`, `findByCode`), karena tugasnya justru menemukan `siteId`.
   - Setiap query menyaring `site_id` pada setiap tabel yang disentuh, walau composite FK sudah menjamin relasinya satu site.
   - Hanya konten publik yang keluar: `PUBLISHED` dan `published_at <= now`. Jam bisa disuntik agar test deterministik.
   - Kategori dan penulis `HIDDEN` tidak bisa dibuka dan filternya kosong, tetapi artikel di dalamnya tetap tampil.
   - Menu tidak pernah memuat tautan mati. Repository mengembalikan tujuan (`target`), bukan URL; pola URL urusan lapisan view model.
2. Tulis tipe bersama (batas nomor halaman `MAX_PAGE` ditambahkan di bab "Membangun Layar Admin"): `SiteId`, konteks repository (koneksi + jam), bentuk wajib fungsi ber-`siteId`, paginasi, dan referensi media untuk komponen gambar:

@@include packages/core/src/repositories/types.ts ts@@

3. Tulis helper bersama: aturan "tampil publik" dan pemuat media yang hanya mengambil media milik site tersebut:

@@include packages/core/src/repositories/shared.ts ts@@

4. Tulis repository site: normalisasi Host, resolver multi-site (Host → site, termasuk penanda alias seperti `www.`), resolver single-site (kode → site), dan theme aktif. Hanya site berstatus `ACTIVE` yang bisa ditemukan. `satisfies` membuat compiler memeriksa bentuk setiap fungsi:

@@include packages/core/src/repositories/site-repository.ts ts@@

5. Tulis repository konten: feed dan listing per kategori (termasuk sub-kategori), tag, dan penulis dengan paginasi; pencarian full-text per site; detail artikel dan halaman berdasarkan slug; pohon kategori; detail kategori, tag, dan penulis; serta pencarian redirect. Ringkasan artikel dimuat dalam dua query paralel (artikel + tag) agar tidak terjadi N+1. Fungsi `getMediaByIds` ditambahkan di bab "Membangun Halaman Publik dari View Model", dan `listSitemapEntries` di bab "Menambahkan Embed, SEO, dan Feed":

@@include packages/core/src/repositories/content-repository.ts ts@@

6. Tulis repository menu. Item disusun menjadi pohon; item nonaktif atau yang tujuannya tidak tampil dibuang beserta seluruh turunannya. Field `publishedAt` pada target artikel ditambahkan di bab "Membangun Halaman Publik dari View Model":

@@include packages/core/src/repositories/menu-repository.ts ts@@

7. Gabungkan semuanya dalam satu factory. Buat satu instance per proses (repository `users` dan `editor` ditambahkan di bab "Membangun Login Admin" dan "Menyimpan Konten dari Admin"):

@@include packages/core/src/repositories/index.ts ts@@

8. Ekspor semua dari entry point paket core. Baris `site/mode` dan `site/resolve` ditambahkan di bab "Memilih Site dari Domain Request", `media/storage` di bab "Membangun Sistem Template", dan modul `views/*` di bab "Membangun Halaman Publik dari View Model":

@@include packages/core/src/index.ts ts@@

9. Tulis test untuk helper murni (normalisasi Host, normalisasi path, paginasi). Test ini tidak butuh database:

@@include packages/core/src/repositories/helpers.test.ts ts@@

10. Tulis test repository terhadap database. Bagian terpenting adalah isolasi antar-site: setiap fungsi wajib terdaftar di test ini, site yang tidak ada tidak pernah menghasilkan data, dan slug yang sama di dua site tidak pernah tertukar. Bagian "site sementara" membuat data uji di dalam transaksi lalu membatalkannya, untuk menguji status SUSPENDED, HIDDEN, PENDING, dan artikel terjadwal. Test ini memakai dua site contoh dari data seed Anda:

@@include packages/core/src/repositories/repositories.test.ts ts@@

11. Tambahkan pengaman CI. Test database yang dilewati karena `DATABASE_URL` kosong bisa membuat CI hijau padahal test isolasi tidak pernah berjalan. Test ini memaksa `DATABASE_URL` ada setiap kali berjalan di CI:

@@include tests/ci-guard.test.ts ts@@

# Menjalankan Semua Pemeriksaan di CI

1. Buat `.gitlab-ci.yml` dengan dua job yang berjalan paralel:
   - `check`: Node 24 + pnpm dari corepack. Menyalakan PostgreSQL 18.7 sebagai service, menjalankan migration dan seed, lalu `pnpm lint`, `pnpm typecheck`, `pnpm test`. Test berjalan sebagai role aplikasi `blog_app`, bukan pemilik schema.
   - `db`: uji lengkap `run_all.sh` (50 pemeriksaan) di container PostgreSQL 18.7.
   - Job ketiga, `build`, ditambahkan di bab "Mem-build Aplikasi Web di CI" setelah aplikasi Nuxt ada.
2. Aturan `workflow` mencegah pipeline ganda saat branch punya merge request terbuka. Store pnpm di-cache berdasarkan `pnpm-lock.yaml`.

@@include .gitlab-ci.yml yaml@@

3. Push ke GitLab, lalu buka menu Build → Pipelines. Kedua job harus hijau. Pipeline hijau pertama menandai fondasi selesai: repository, database, dan tooling sudah terbukti berjalan di mesin selain laptop Anda.
4. Jadikan ini kebiasaan untuk setiap task berikutnya:
   - aturan baru selalu punya test, dan CI harus hijau;
   - perubahan schema selalu berupa file migration baru;
   - tidak ada secret di Git;
   - keputusan yang mahal diubah ditulis sebagai ADR.

# Membangun Kerangka Aplikasi Web dengan Nuxt

1. Periksa versi Nuxt terbaru sebelum memasang. Buku ini memakai Nuxt 4.6.4, yang butuh Node `^22.22.3`, `^24.15.0`, atau `>=26`:

```bash
pnpm view nuxt dist-tags
pnpm view nuxt@latest engines
```

2. Pasang Nuxt, Vue, dan Vue Router ke `apps/web`:

```bash
pnpm --filter @framework/web add nuxt@4.6.4 vue@^3.5.45 vue-router@^5.5.1
```

3. pnpm 12 menolak menjalankan build script dependency yang belum diizinkan, dan install berhenti dengan `ERR_PNPM_IGNORED_BUILDS` untuk esbuild. Izinkan esbuild saja, jangan semua paket sekaligus. Postinstall esbuild hanya memverifikasi binary sesuai platform. Perintah ini menulis `allowBuilds` ke `pnpm-workspace.yaml`:

```bash
pnpm approve-builds esbuild
pnpm install
```

4. Lengkapi `apps/web/package.json`:
   - `dev` membaca `.env` di root repo lewat `--dotenv ../../.env`, jadi `DATABASE_URL` cukup ditulis sekali.
   - `preview` menjalankan hasil build dengan `.env` root bila ada.
   - `postinstall` menjalankan `nuxt prepare`, yang membuat folder `.nuxt/` berisi tipe dan tsconfig setiap kali `pnpm install`.
   - Paket workspace `@framework/core` dan `@framework/db` dipasang sebagai dependency.
   - Script `typecheck` dan devDependency `vue-tsc` ditambahkan di bab berikutnya, script `smoke` di bab build CI. Dependency paket template dan opsi `--host localhost` pada `dev` ditambahkan di bab "Membangun Sistem Template".

@@include apps/web/package.json json@@

5. Tulis `nuxt.config.ts`. Paket workspace diekspor sebagai source TypeScript (`./src/index.ts`), jadi harus ikut di-bundle oleh Nitro lewat `externals.inline`. Tanpa ini, server produksi mencoba meng-import file `.ts` dari `node_modules` saat runtime. Paket template-kit dan template ditambahkan ke daftar itu di bab "Menyusun Halaman Depan dari Section", dan `routeRules` admin di bab "Membangun Login Admin":

@@include apps/web/nuxt.config.ts ts@@

6. Buat `apps/web/tsconfig.json` yang merujuk ke empat tsconfig buatan Nuxt di `.nuxt/`, satu per lingkungan:

@@include apps/web/tsconfig.json jsonc@@

7. Siapkan koneksi database untuk server. Buat satu pool dan satu set repository per proses, bukan per request. Pool dibuat saat pertama kali dipakai, sehingga `nuxt build` tidak butuh `DATABASE_URL`. Semua yang khusus untuk satu request (site, theme) nantinya disimpan di `event.context`, bukan di modul ini:

@@include apps/web/server/utils/database.ts ts@@

8. Tutup pool saat server berhenti. Import `nuxt/server` di Nuxt 4.6 belum menyediakan hook shutdown, jadi file ini memakai API Nitro (`defineNitroPlugin` dan hook `close`). Hanya folder `server/plugins/` yang boleh memakai API Nitro, sehingga saat upgrade ke Nuxt 5 cukup folder ini yang perlu diperiksa:

@@include apps/web/server/plugins/database.ts ts@@

9. Tulis server route pertama dengan import `nuxt/server` (ADR-002), bukan `h3`. `GET /api/health` menjalankan `select 1`. Bila database tidak bisa dihubungi, route ini mengembalikan HTTP 503. Detail error hanya ditulis ke log server dan tidak dikirim ke klien:

@@include apps/web/server/api/health.get.ts ts@@

10. Buat halaman sementara di `apps/web/app/app.vue`. Isinya nanti diganti oleh template (versi lengkapnya ada di bab "Membangun Sistem Template"). Untuk sekarang cukup:

```vue
<template>
  <main>
    <h1>Framework web artikel</h1>
    <p>Aplikasi berjalan. Status server: <code>/api/health</code></p>
  </main>
</template>
```

11. Tambahkan script `dev` dan `build` di `package.json` root (lihat bab monorepo), lalu jalankan aplikasi. `/api/health` bisa dibuka dari `localhost`, sedangkan halaman lain butuh domain site (bab "Memilih Site dari Domain Request"):

```bash
pnpm dev
# buka http://localhost:3000/api/health
# {"status":"ok","database":"ok"}
```

12. Uji build produksi, termasuk tiga hal berikut:
   - Health check memakai role aplikasi.
   - Jalur gagal mengembalikan 503.
   - Pool tertutup saat server dihentikan.

```bash
pnpm build
pnpm --filter @framework/web preview          # http://localhost:3000/api/health

# Di terminal lain: koneksi harus memakai role blog_app
docker compose exec db psql -U blog -d blog_dev -c \
  "select usename, application_name from pg_stat_activity where application_name = 'blog-framework-web'"

# Hentikan server (Ctrl+C), lalu ulangi query di atas: hasilnya harus kosong.

# Jalur gagal: database salah -> HTTP 503
DATABASE_URL=postgres://x:y@127.0.0.1:59999/x node apps/web/.output/server/index.mjs
```

13. Jalankan `pnpm check`. Lint, typecheck root, dan semua test harus tetap hijau. Typecheck untuk file `.vue` dibahas di bab berikutnya.

# Memeriksa Komponen Vue dengan ESLint dan vue-tsc

1. Pahami celahnya dulu. Aturan import template di `eslint.config.js` sudah menyebut file `.vue`, tetapi ESLint belum bisa membacanya. Coba lint komponen apa saja dan hasilnya `Parsing error`. Artinya, komponen template bisa import `@framework/db` tanpa ketahuan. Typecheck root (`tsc`) juga tidak membaca `.vue` sama sekali.

2. Pasang parser dan plugin Vue untuk ESLint di root. `eslint-plugin-vue` 10 butuh `vue-eslint-parser` ^10.3 sebagai peer dependency:

```bash
pnpm add -Dw eslint-plugin-vue@^10.12.1 vue-eslint-parser@^10.4.2
```

3. Tambahkan dua blok ke `eslint.config.js`, tepat setelah `tseslint.configs.recommended`:
   - `pluginVue.configs['flat/recommended']` memasang parser `.vue` dan aturan Vue yang disarankan.
   - Blok `files: ['**/*.vue']` meminta parser Vue memakai parser typescript-eslint untuk `<script lang="ts">`. Tanpa ini, script TypeScript di komponen gagal diparse.

```js
import pluginVue from 'eslint-plugin-vue'

  // ...
  tseslint.configs.recommended,

  pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
```

   Karena aturan `no-restricted-imports` untuk `templates/**/*.vue` ditulis setelahnya, aturan itu kini benar-benar berlaku untuk komponen.

4. Tambahkan kasus `.vue` ke `tests/architecture.test.ts`. Kode yang diuji dibungkus dalam `<script setup lang="ts">` dan `<template>`, lalu diperiksa tiga hal:
   - Import core, db, dan driver pg di komponen template ditolak.
   - Import tipe dari `@framework/template-kit` diizinkan.
   - Komponen diparse tanpa error fatal. Ini menjaga agar konfigurasi parser tidak rusak diam-diam: bila parser hilang, kasus penolakan juga ikut gagal karena tidak ada pesan `no-restricted-imports`.

   Isi lengkap file ada di bab "Menyiapkan TypeScript, ESLint, dan Vitest".

5. Pasang `vue-tsc` di `apps/web`. `nuxt typecheck` memakai `vue-tsc` dari dependency proyek. Pasang juga `typescript` dengan versi yang sama dengan root, agar app dan root memakai compiler yang sama:

```bash
pnpm --filter @framework/web add -D vue-tsc@^3.3.14 typescript@~6.0.3
```

6. Tambahkan script `"typecheck": "nuxt typecheck"` di `apps/web/package.json` (lihat bab aplikasi web). `nuxt typecheck` menjalankan `vue-tsc` dengan empat tsconfig buatan Nuxt, sehingga kode app (`.vue`) dan kode server sama-sama diperiksa.

7. Gabungkan ke `typecheck` root, agar `pnpm check` juga memeriksa Nuxt:

```json
"typecheck": "tsc -p tsconfig.json && pnpm --filter @framework/web typecheck"
```

   Template belum punya kode. Begitu komponen template di-import oleh app, `vue-tsc` ikut memeriksanya lewat import itu.

8. Pastikan pemeriksaan benar-benar menangkap kesalahan. Sisipkan error sementara, jalankan, lalu kembalikan file:

```bash
# di apps/web/app/app.vue tambahkan:
#   <script setup lang="ts">
#   const n: number = 'teks'
#   </script>
pnpm typecheck     # app/app.vue: error TS2322
pnpm lint          # 'n' is assigned a value but never used

# di apps/web/server/api/health.get.ts tambahkan:
#   const x: string = 1; export { x }
pnpm typecheck     # server/api/health.get.ts: error TS2322
```

9. CI tidak perlu diubah. Job `check` sudah menjalankan `pnpm install`, yang memicu `nuxt prepare` dan membuat `.nuxt/`, lalu `pnpm typecheck` yang kini ikut menjalankan `nuxt typecheck`.

10. Jalankan `pnpm check`. Lint (termasuk `.vue`), typecheck root dan Nuxt, serta semua test harus hijau.

# Mem-build Aplikasi Web di CI

1. Pahami celahnya. Job `check` menjalankan lint, typecheck, dan test, tetapi tidak pernah menjalankan `nuxt build`. Kesalahan yang hanya muncul saat build tidak akan ketahuan sampai deploy. Contohnya: paket workspace yang lupa dimasukkan ke `externals.inline`, atau dependency yang tidak ikut ter-bundle.

2. Build yang sukses belum cukup, karena server bisa saja crash saat start. Tulis smoke test `apps/web/scripts/smoke-build.mjs` yang:
   - menjalankan `.output/server/index.mjs` di port 3999;
   - menunggu sampai `/api/health` menjawab (paling lama 30 detik);
   - mencocokkan status HTTP dengan `EXPECT_STATUS` (default 200) dan memastikan body adalah respons health check;
   - menghentikan server dan keluar dengan kode 1 bila ada yang tidak cocok.

   Pemeriksaan halaman (`SMOKE_HOSTS`) ditambahkan di bab "Membangun Sistem Template", setelah ada halaman yang bisa dirender.

Versi di bawah sudah memakai modul bersama `scripts/lib/built-server.mjs` dari bab "Membuktikan Isolasi Antar-Site".

@@include apps/web/scripts/smoke-build.mjs js@@

3. Tambahkan script `"smoke": "node --env-file-if-exists=../../.env scripts/smoke-build.mjs"` di `apps/web/package.json`. Variabel yang sudah ada di lingkungan tidak ditimpa oleh `.env`, jadi CI tetap bisa mengatur `DATABASE_URL` sendiri.

4. Coba di lokal dengan database hidup, lalu dengan database yang sengaja tidak ada:

```bash
pnpm build
pnpm --filter @framework/web smoke
# [smoke] http://127.0.0.1:3999/api/health -> 200 {"status":"ok","database":"ok"}

DATABASE_URL=postgres://smoke:smoke@127.0.0.1:1/smoke EXPECT_STATUS=503 \
  pnpm --filter @framework/web smoke
# [smoke] ... -> 503 {"status":"error","database":"unreachable"}

# Status tidak sesuai harus gagal (exit 1):
DATABASE_URL=postgres://smoke:smoke@127.0.0.1:1/smoke pnpm --filter @framework/web smoke
```

5. Tambahkan job `build` di `.gitlab-ci.yml` (file lengkap ada di bab CI; versi akhirnya memakai PostgreSQL, lihat bab "Membangun Sistem Template"):
   - Versi pertama ini tidak memakai service PostgreSQL. `DATABASE_URL` sengaja menunjuk port yang tidak ada dan `EXPECT_STATUS` diisi 503. Server harus start dan menjawab 503, bukan crash. Itu sudah membuktikan bundle bisa start, route ikut ter-build, dan driver `pg` ikut terbawa.
   - Cache store pnpm memakai kunci yang sama dengan `check`, tetapi dengan `policy: pull` agar dua job paralel tidak saling menimpa cache.
   - Hasil build `apps/web/.output/` disimpan sebagai artifact selama satu minggu. Artifact ini berguna untuk memeriksa isi bundle, dan nanti untuk deploy.

```yaml
build:
  stage: check
  image: node:24
  variables:
    DATABASE_URL: "postgres://smoke:smoke@127.0.0.1:1/smoke"
    EXPECT_STATUS: "503"
  script:
    - pnpm build
    - pnpm --filter @framework/web smoke
  artifacts:
    paths:
      - apps/web/.output/
    expire_in: 1 week
```

6. Push, lalu pastikan ketiga job (`check`, `build`, `db`) hijau di Build → Pipelines.

# Memilih Site dari Domain Request

1. Pahami alurnya. Setiap request harus tahu site mana yang dilayani sebelum halaman apa pun dirender:
   - Mode multi: header `Host` dicari di `site_domains`.
   - Mode single: hanya site `SITE_CODE` yang dilayani, tetapi `Host` tetap dicek. Domain milik site lain di database yang sama ditolak.
   - Domain alias (`is_primary = false`, misalnya `www.*`) dialihkan 301 ke domain primary.
   - Host yang tidak dikenal dijawab 404 netral: teks biasa, tanpa template, dan tanpa membocorkan nama site lain.
   - Hasilnya disimpan di `event.context`, bukan di variabel modul, karena satu proses melayani banyak site sekaligus (ADR-001).

2. Pisahkan logika dari HTTP. Keputusan "site mana, redirect, atau 404" ditulis di `@framework/core` sebagai fungsi murni yang bisa diuji tanpa Nuxt. Aplikasi web hanya menerjemahkan hasilnya ke respons HTTP.

3. Tulis validasi mode deploy dengan Zod di `packages/core/src/site/mode.ts`:
   - `SITE_MODE` wajib diisi, `single` atau `multi`.
   - `SITE_CODE` wajib di mode single, dengan format yang sama dengan constraint `sites_code_format`.
   - `SITE_CODE` yang diisi di mode multi ditolak karena ambigu: siapa pun yang membaca config bisa mengira site sudah dikunci.
   - Nilai kosong dianggap tidak diisi, dan pesan error menyebut setiap variabel yang bermasalah.

@@include packages/core/src/site/mode.ts ts@@

4. Tulis resolver di `packages/core/src/site/resolve.ts`. Hasilnya union tiga kemungkinan: `site`, `redirect`, atau `not-found`. Mode single cukup satu panggilan `findByDomain(host)` lalu mencocokkan `site.code`, jadi pengecekan domain tidak menambah query. Normalisasi Host (huruf kecil, tanpa port, tanpa titik di ujung) sudah dilakukan `normalizeHost` di repository site. Alias hanya dialihkan bila site punya domain primary aktif; tanpa primary, alias tetap dilayani agar site tidak hilang:

@@include packages/core/src/site/resolve.ts ts@@

5. Ekspor keduanya dari `packages/core/src/index.ts` (lihat bab repository):

```ts
export * from './site/mode'
export * from './site/resolve'
```

6. Uji validasi env, termasuk semua kombinasi yang harus ditolak:

@@include packages/core/src/site/mode.test.ts ts@@

7. Uji resolver dalam dua lapis:
   - Unit test dengan repository palsu, untuk semua cabang keputusan: kedua mode, Host huruf besar dan ber-port, alias, alias tanpa primary, Host tak dikenal atau tidak valid, dan domain site lain di mode single.
   - Test terhadap database seed (dilewati tanpa `DATABASE_URL`), untuk memastikan normalisasi Host dan alias `www.tekno.localhost` bekerja dengan data sungguhan.

@@include packages/core/src/site/resolve.test.ts ts@@

8. Di `apps/web`, simpan mode deploy sekali per proses. Ini config proses, bukan state per request:

@@include apps/web/server/utils/site-mode.ts ts@@

9. Validasi config saat server start lewat plugin Nitro. Bila env salah, plugin melempar `SiteModeConfigError` dan proses berhenti dengan exit 1, alih-alih baru gagal saat request pertama:

@@include apps/web/server/plugins/site-mode.ts ts@@

10. Daftarkan tipe `event.context.site` dan `event.context.siteDomain` (field `theme` menyusul di bab "Membangun Sistem Template" dan berubah menjadi `ResolvedTheme` di bab "Menyusun Halaman Depan dari Section") dengan augmentasi `RequestEventContext` dari `nuxt/schema`. File di `shared/types/` terbaca oleh tsconfig app maupun server, sehingga `useRequestEvent()` di komponen juga mengenal tipenya:

@@include apps/web/shared/types/site-context.d.ts ts@@

11. Tulis middleware `apps/web/server/middleware/site.ts`. Middleware di folder ini berjalan untuk setiap request sebelum route. Beberapa hal penting:
    - `/api/health` dan aset build Nuxt (`/_nuxt/`) dilewati, karena health check container memanggil server lewat `localhost`.
    - `Host` dibaca dari header `Host`, bukan `X-Forwarded-Host`, karena header itu bisa dipalsukan klien. Reverse proxy di produksi wajib meneruskan `Host` asli.
    - `X-Forwarded-Proto` boleh dipercaya karena hanya menentukan `http` atau `https` pada URL redirect ke domain primary site yang sama.
    - Redirect mempertahankan path, query, dan port.
    - Pemuatan theme aktif (`event.context.theme`) ditambahkan di bab "Membangun Sistem Template", lalu dipindah ke sebelum view model di bab "Menyusun Halaman Depan dari Section".
    - Penanganan path admin (host admin, 404 di domain site) ditambahkan di bab "Membangun Login Admin".

@@include apps/web/server/middleware/site.ts ts@@

12. Tampilkan nama site di halaman sementara `app.vue` untuk membuktikan context sampai ke render, misalnya `const siteName = useState('site-name', () => useRequestEvent()?.context.site?.name ?? null)`. `useState` membawa nilainya dari server ke browser. Fungsi `useState` dan `useRequestEvent` di-auto-import oleh Nuxt, jadi aturan ESLint `no-undef` dimatikan untuk `.vue` (lihat `eslint.config.js`). Nama yang benar-benar tidak ada tetap ditangkap oleh `vue-tsc`:

```js
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
    rules: { 'no-undef': 'off' },
  },
```

13. Pahami mengapa domain seed berakhiran `.localhost`. Dev server Vite menolak Host selain `localhost`, subdomain `.localhost`, dan alamat IP dengan 403 `Blocked request`. Browser juga selalu mengarahkan `*.localhost` ke komputer sendiri tanpa DNS. Jadi domain seed `tekno.localhost` dan `kuliner.localhost` bisa langsung dibuka tanpa mengubah `nuxt.config.ts` dan tanpa file hosts, yang di laptop kantor sering tidak bisa diubah karena butuh hak Administrator.

14. Tambahkan `SITE_MODE=multi` ke `.env` (dan `.env.example`), lalu tambahkan juga `SITE_MODE: multi` ke variabel job CI `build`. Tanpa itu, smoke test gagal karena server tidak mau start.

15. Pastikan config yang salah membuat server gagal start:

```bash
pnpm build
SITE_MODE=multi SITE_CODE=kabar-tekno node --env-file=.env apps/web/.output/server/index.mjs
# SiteModeConfigError: Konfigurasi mode site tidak valid -> SITE_CODE: tidak boleh diisi saat SITE_MODE=multi ...
# exit 1
```

16. Uji semua jalur lewat HTTP dengan header Host. Variabel dari lingkungan menang atas isi `.env`, jadi mode bisa diganti per perintah:

```bash
PORT=3998 node --env-file=.env apps/web/.output/server/index.mjs

curl -i -H 'Host: tekno.localhost' http://127.0.0.1:3998/            # 200, <h1>Kabar Tekno</h1>
curl -i -H 'Host: TEKNO.LocalHost:3998' http://127.0.0.1:3998/       # 200, Host dinormalisasi
curl -i -H 'Host: www.tekno.localhost:3998' http://127.0.0.1:3998/a  # 301 -> http://tekno.localhost:3998/a
curl -i -H 'Host: evil.example.com' http://127.0.0.1:3998/            # 404 "Situs tidak ditemukan."
curl -i -H 'Host: evil.example.com' http://127.0.0.1:3998/api/health  # 200, health tidak butuh site

# Mode single: domain site lain ditolak
SITE_MODE=single SITE_CODE=dapur-nusantara PORT=3998 node --env-file=.env apps/web/.output/server/index.mjs
curl -i -H 'Host: kuliner.localhost' http://127.0.0.1:3998/          # 200, <h1>Dapur Nusantara</h1>
curl -i -H 'Host: tekno.localhost' http://127.0.0.1:3998/            # 404
```

17. Buka site di browser setelah `pnpm dev`: http://tekno.localhost:3000 dan http://kuliner.localhost:3000. Ketik lengkap dengan `http://`. Bila memakai WSL dengan browser Windows, pastikan `networkingMode=mirrored` ada di `%USERPROFILE%\.wslconfig` agar browser Windows sampai ke server di WSL.

18. Jalankan `pnpm check` dan smoke test build. Semuanya harus hijau.

# Membangun Sistem Template

1. Pahami pembagiannya sebelum menulis kode (ADR-005):
   - `packages/template-kit`: kontrak. Berisi `defineTemplate`, tipe view model, util token → CSS variable, dan registry. Tidak boleh bergantung pada core atau database.
   - `templates/base`: semua komponen UI dan view untuk setiap jenis halaman, dengan gaya netral.
   - `templates/<nama>`: manifest, token, opsi, dan CSS. Komponen diwarisi dari base; override komponen adalah pengecualian dan belum didukung.
   - `apps/web`: mendaftarkan template di registry, memuat theme aktif per request, memasang CSS variable dan kelas root.
   - Core yang membangun view model (bab berikutnya). Template hanya menerima data siap tampil.

2. Tulis tipe view model di `packages/template-kit/src/view-models.ts`. Ini kontrak publik antara core dan template: menambah field aman, menghapus atau mengganti nama field berarti versi mayor. Field `embedSrc` pada block embed ditambahkan di bab "Menambahkan Embed, SEO, dan Feed". Aturannya:
   - Semua URL sudah jadi (`href`, termasuk `action` form pencarian), jadi template tidak pernah menyusun URL dan pola permalink cukup diketahui core.
   - Tanggal sudah diformat (`DateView` berisi `iso` dan `label`).
   - Teks selalu polos, dan hanya tipe JSON agar bisa dikirim dari server ke browser.

@@include packages/template-kit/src/view-models.ts ts@@

3. Tulis util token → CSS variable di `tokens.ts`. Hasilnya disisipkan ke `<style>` di `<head>`, jadi nilainya dijaga ketat walau sudah divalidasi skema:
   - Karakter yang bisa keluar dari deklarasi atau blok CSS (`; { } < > \` dan baris baru) ditolak, begitu juga `url(...)`.
   - Hanya string dan angka yang diterima.
   - Nilai di grup `font` diberi tanda kutip, karena nama seperti `Source Sans 3` tidak sah tanpa kutip.

@@include packages/template-kit/src/tokens.ts ts@@

4. Tulis `defineTemplate` di `manifest.ts`. Catatan: file `manifest.ts`, `theme.ts`, `index.ts`, `view-models.ts`, dan test template-kit di bab ini sudah versi akhir dari bab "Menyusun Halaman Depan dari Section", yang memecah manifest menjadi `defineManifest` (tanpa Vue) dan `defineTemplate` (manifest + komponen) serta menambah section. Bila mengikuti urutan bab, buat juga `sections.ts` dari bab itu sekarang. Template dengan `extends` mewarisi semua yang tidak ia definisikan sendiri: skema token/opsi, default (digabung per key dengan `mergeDeep`), lokasi menu, layout, dan view. Semuanya diperiksa saat modul di-import: format key, semver, default lolos skema dan bisa dijadikan CSS, serta view lengkap. Manifest yang salah langsung gagal di test dan build:

@@include packages/template-kit/src/manifest.ts ts@@

@@include packages/template-kit/src/objects.ts ts@@

5. Tulis registry dan validasi theme di `theme.ts`:
   - `resolveConfig` memvalidasi config per key. Nilai yang tidak valid jatuh ke default, dan key yang tidak dikenal dibuang. Satu warna yang salah tidak merusak seluruh theme.
   - `createTemplateRegistry(...).resolveTheme(barisSiteThemes)` mencari template berdasarkan `template_key`. Bila tidak terdaftar, dipakai template fallback (base), dan semua masalah dikumpulkan di `issues` untuk dicatat, bukan dilempar sebagai error.
   - Hasilnya (`ResolvedTheme`) hanya berisi data JSON, jadi bisa dikirim ke browser. Komponen diambil lagi dari registry lewat `templateKey`.

@@include packages/template-kit/src/theme.ts ts@@

6. Ekspor semuanya dari `index.ts`. `z` diekspor ulang agar template menulis skema tanpa dependency Zod sendiri:

@@include packages/template-kit/src/index.ts ts@@

7. Lengkapi `package.json` dan `tsconfig.json` template-kit. Vue cukup jadi `peerDependencies` karena hanya tipe `Component` yang dipakai:

@@include packages/template-kit/package.json json@@

8. Uji template-kit: token berbahaya ditolak, pewarisan manifest, validasi per key, dan registry dengan fallback:

@@include packages/template-kit/src/tokens.test.ts ts@@

@@include packages/template-kit/src/manifest.test.ts ts@@

@@include packages/template-kit/src/theme.test.ts ts@@

9. Tambahkan sisi baca storage media di core (`packages/core/src/media/storage.ts`). `storage_key` diubah menjadi URL publik (default `/media/...`, bisa diganti URL CDN lewat `MEDIA_BASE_URL`), dan `MediaRef` dari repository diubah menjadi `ImageView` untuk SmartImage. `splitStorageKey` menolak key yang bisa keluar dari folder media (`..`, slash ganda, karakter aneh):

@@include packages/core/src/media/storage.ts ts@@

@@include packages/core/src/media/storage.test.ts ts@@

10. Daftarkan subpath `./media` di `packages/core/package.json` dan tambahkan dependency `@framework/template-kit` (untuk tipe `ImageView`). Subpath ini penting: entry utama core membawa `@framework/db` dan driver `pg`, sedangkan subpath `media` murni dan aman di-import dari kode Vue:

@@include packages/core/package.json json@@

11. Buat skema token dan opsi base di `templates/base/src/config.ts`. Template turunan mewarisinya, jadi komponen base boleh mengandalkan variabel `--color-primary`, `--color-surface`, `--color-text`, `--font-heading`, `--font-body`, `--radius-card`, serta opsi `header.style` dan `header.showDate`:

@@include templates/base/src/config.ts ts@@

12. Tulis manifest base. File `index.ts`, `HomeView.vue`, `base.css`, `package.json`, `test-fixtures.ts`, dan `render.test.ts` base di bab ini juga sudah versi akhir: entry `./manifest`, folder `sections/`, dan home berbasis section dijelaskan di bab "Menyusun Halaman Depan dari Section". Setiap view dimuat saat dibutuhkan (`() => import(...)`), dan CSS serta font di-import sebagai efek samping modul:

@@include templates/base/src/index.ts ts@@

13. Self-host font. Paket `@fontsource` berisi file woff2 dan `@font-face` dengan `unicode-range`, sehingga browser hanya mengunduh family dan subset yang dipakai:

@@include templates/base/src/styles/fonts.css css@@

14. Tulis komponen dasar di `templates/base/src/components/`:
    - `SmartImage.vue`: satu-satunya cara menampilkan gambar. Dengan `ratio`, gambar dipotong dengan titik fokus media sebagai pusat (`object-position`). Rasio yang tidak sesuai pola diabaikan.
    - `MenuTree.vue`: menu sebagai pohon, rekursif untuk submenu.
    - `SiteHeader.vue`, `SiteFooter.vue`: memakai opsi `header.style` dan `header.showDate`.
    - `ArticleCard.vue`, `ArticleList.vue`, `PaginationNav.vue`, `BreadcrumbNav.vue`.
    - `BlockRenderer.vue`: versi dasar untuk enam tipe block. Teks dirender lewat interpolasi Vue (di-escape), tidak pernah `v-html`. Embed masih berupa tautan keluar; iframe ditambahkan di bab "Menambahkan Embed, SEO, dan Feed".

@@include templates/base/src/components/SmartImage.vue vue@@

@@include templates/base/src/components/MenuTree.vue vue@@

@@include templates/base/src/components/SiteHeader.vue vue@@

@@include templates/base/src/components/SiteFooter.vue vue@@

@@include templates/base/src/components/ArticleCard.vue vue@@

@@include templates/base/src/components/ArticleList.vue vue@@

@@include templates/base/src/components/PaginationNav.vue vue@@

@@include templates/base/src/components/BreadcrumbNav.vue vue@@

@@include templates/base/src/components/BlockRenderer.vue vue@@

15. Tulis layout dan delapan view, satu per jenis halaman. Setiap view menerima satu prop `vm` dengan tipe view model halamannya:

@@include templates/base/src/TemplateLayout.vue vue@@

@@include templates/base/src/views/HomeView.vue vue@@

@@include templates/base/src/views/ArticleView.vue vue@@

@@include templates/base/src/views/PageView.vue vue@@

@@include templates/base/src/views/CategoryView.vue vue@@

@@include templates/base/src/views/TagView.vue vue@@

@@include templates/base/src/views/AuthorView.vue vue@@

@@include templates/base/src/views/SearchView.vue vue@@

@@include templates/base/src/views/NotFoundView.vue vue@@

16. Tulis CSS dasar. Semua aturan di bawah `.tpl` (wrapper halaman), dan semua nilai visual dari variabel token. Warna sekunder diturunkan dengan `color-mix`, jadi token warna cukup tiga:

@@include templates/base/src/styles/base.css css@@

17. Lengkapi `package.json` base:

@@include templates/base/package.json json@@

18. Buat template magazine. Di versi akhir (bab "Menyusun Halaman Depan dari Section") manifest magazine pindah ke `src/manifest.ts`, dan `index.ts` hanya menambahkan CSS. Test magazine di bab ini sudah versi 1.1.0 dari bab "Memigrasi Config Theme Antar-Versi". Isinya hanya manifest dengan `extends: base`, default token dan opsi, serta CSS di bawah `.tpl-magazine`. Tidak ada komponen sendiri:

@@include templates/magazine/src/index.ts ts@@

@@include templates/magazine/src/styles.css css@@

@@include templates/magazine/package.json json@@

19. Pasang dependency dan tooling. `@vitejs/plugin-vue` disamakan dengan versi yang dipakai Nuxt, dan `vue-tsc` di root dipakai untuk typecheck folder `templates/`:

```bash
pnpm install
pnpm add -Dw @vitejs/plugin-vue@6.0.11 vue@^3.5.45 vue-tsc@^3.3.14
```

20. Typecheck template dengan `vue-tsc`, karena `tsc` biasa tidak membaca `.vue`. Buat `templates/tsconfig.json` dan deklarasi import CSS:

@@include templates/tsconfig.json jsonc@@

@@include templates/env.d.ts ts@@

   Lalu tambahkan ke script `typecheck` root:

```json
"typecheck": "tsc -p tsconfig.json && vue-tsc -p templates/tsconfig.json --noEmit && pnpm --filter @framework/web typecheck"
```

21. Pasang `@vitejs/plugin-vue` di `vitest.config.ts`, agar test bisa merender komponen `.vue` tanpa Nuxt:

@@include vitest.config.ts ts@@

22. Uji render SSR semua view base dengan view model contoh. Test ini memastikan manifest menunjuk ke file yang benar, setiap view menampilkan datanya, dan teks konten selalu di-escape:

@@include templates/base/src/test-fixtures.ts ts@@

@@include templates/base/src/render.test.ts ts@@

23. Uji manifest magazine: semua view dan layout diwarisi dari base, dan config dari seed lolos validasi. Opsi `adSlots` di seed memang belum menjadi opsi template, jadi tercatat sebagai key tidak dikenal:

@@include templates/magazine/src/manifest.test.ts ts@@

24. Jaga agar CSS satu template tidak bocor ke site lain. Di mode multi-site semua CSS template dimuat bersama, jadi test ini memeriksa bahwa setiap selector diawali kelas root template itu sendiri (`.tpl` untuk base, `.tpl-<key>` untuk yang lain):

@@include tests/template-css.test.ts ts@@

25. Di `apps/web`, tambahkan dependency ketiga paket template ke `package.json` (lihat bab aplikasi web), lalu buat registry. Menambah template cukup dengan mendaftarkannya di sini:

@@include apps/web/app/templates.ts ts@@

26. Muat theme aktif di middleware. Hanya request halaman yang memuat theme; `/api/` dan `/media/` tidak membutuhkannya. Tambahkan juga `theme?: StoredTheme | null` ke augmentasi `RequestEventContext` di `shared/types/site-context.d.ts`. Versi akhir kedua file ada di bab berikutnya:

```ts
/** Route yang butuh site tetapi bukan halaman: tidak perlu memuat theme. */
const NON_PAGE_PREFIXES = ['/api/', '/media/']

// di cabang result.kind === 'site', setelah context.site diisi:
if (!NON_PAGE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
  event.context.theme = await useRepositories().sites.getActiveTheme(site.id)
}
```

27. Selesaikan theme di plugin khusus server (`app/plugins/site.server.ts`). Akhiran `.server.ts` membuat plugin ini tidak ikut ke bundle browser:
    - Theme diselesaikan lewat registry. `issues` dicatat ke log sekali per proses per site, bukan setiap request.
    - Hasilnya disimpan di `useState` (`app/composables/useSiteTheme.ts`), sehingga ikut ke browser lewat payload.
    - Untuk sementara kerangka halaman (`ChromeView`) dibangun ringkas di plugin ini: nama site, tagline, logo (lewat `toImageView`), tanggal hari ini, tanpa menu. Bab berikutnya menggantinya dengan view model dari core.
    - Dari core hanya di-import tipe dan subpath murni `@framework/core/media`. Entry utama core membawa `pg`, yang rusak bila ikut di-bundle ke bundle SSR Vue. Gejalanya: halaman produksi gagal dengan `Class extends value #<Object> is not a constructor`, sedangkan dev dan `/api/health` tetap normal.

```ts
import type { SiteInfo } from '@framework/core'
import { createMediaUrlResolver, toImageView } from '@framework/core/media'
import { templateRegistry } from '../templates'

export default defineNuxtPlugin(() => {
  const context = useRequestEvent()?.context
  const site = context?.site
  if (!site) return
  const theme = templateRegistry.resolveTheme(context.theme ?? null)
  // ... catat theme.issues ke log, sekali per proses
  useSiteTheme().value = theme
  useChrome().value = temporaryChrome(site) // site + logo + tanggal, tanpa menu
})
```

28. Pasang wrapper dan token di `app.vue`. Halaman dibungkus `<div class="tpl tpl-<key>">`, token menjadi `<style>` di `<head>` lewat `useHead`, dan layout template (`defineAsyncComponent(template.layout)`) dirender dengan isi sementara berupa nama site dan nama template. Versi akhirnya, yang juga merender view, ada di bab berikutnya.

29. Kunci aturan import kode `app/` dengan ESLint (lihat `eslint.config.js`): dari `@framework/core` dan `@framework/db` hanya boleh import tipe (`@typescript-eslint/no-restricted-imports` dengan `allowTypeImports`), dan driver database dilarang. Kasusnya ditambahkan ke `tests/architecture.test.ts`.

30. Sajikan media dari disk lokal lewat `server/routes/media/[...key].get.ts`:
    - Hanya media milik site request itu: segmen pertama `storage_key` harus kode site.
    - Path dicek dengan `splitStorageKey`, lalu dipastikan tetap di dalam `MEDIA_DIR`.
    - SVG bisa memuat script, jadi respons diberi `Content-Security-Policy` ketat dan `nosniff`.
    - Di dev, file yang tidak ada diganti placeholder SVG. Media seed tampil tanpa file gambar di Git.

@@include apps/web/server/routes/media/[...key].get.ts ts@@

31. Tambahkan `MEDIA_DIR` dan `MEDIA_BASE_URL` (opsional) ke `.env.example` (lihat bab PostgreSQL).

32. Batasi dev server ke `localhost` dengan `nuxt dev --host localhost`. Tanpa itu Nuxt mendengarkan di semua interface dan memperingatkan bahwa dev server (berikut source code-nya) bisa dibaca dari jaringan.

33. Perluas smoke test build dengan `SMOKE_HOSTS`: untuk setiap domain, halaman `/` harus 200 dan memuat wrapper template. Format `host=template` (mewajibkan kelas root template tertentu) ditambahkan di bab "Memeriksa Hidrasi di Browser". Smoke test lama hanya memanggil `/api/health`, sehingga tidak menangkap bug bundle SSR di langkah 27:

Versi di bawah sudah memakai modul bersama `scripts/lib/built-server.mjs` dari bab "Membuktikan Isolasi Antar-Site".

@@include apps/web/scripts/smoke-build.mjs js@@

34. Ubah job CI `build` agar memakai PostgreSQL ber-seed (file lengkap di bab CI). Smoke test dijalankan dua kali: tanpa database (health 503, bukan crash) dan dengan database (health 200 + halaman `tekno.localhost` dan `kuliner.localhost`).

35. Uji di dev dan produksi:

```bash
pnpm dev
curl -s -H 'Host: tekno.localhost' http://127.0.0.1:3000/ | grep -o 'class="tpl[^"]*"'
# class="tpl tpl-magazine"
curl -s -H 'Host: kuliner.localhost' http://127.0.0.1:3000/ | grep -o '<style data-hid="theme-tokens">[^<]*'
# .tpl-base{--color-primary:#b3261e;...;--font-heading:"Merriweather";--font-body:"Source Sans 3";...}
# log server: [theme] site dapur-nusantara: template "news" tidak terdaftar, memakai base

curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: kuliner.localhost' http://127.0.0.1:3000/media/kabar-tekno/logo.svg
# 404: media site lain

pnpm build
ls apps/web/.output/public/_nuxt/*.woff2 | head    # font di-self-host
SMOKE_HOSTS=tekno.localhost,kuliner.localhost pnpm --filter @framework/web smoke
```

36. Jalankan `pnpm check`. Lint, typecheck (root, template, Nuxt), dan semua test harus hijau.

# Membangun Halaman Publik dari View Model

1. Putuskan skema URL sebelum menulis route, karena URL publik mahal diubah setelah tersimpan di mesin pencari. Catat sebagai ADR-006:
   - Artikel mengikuti `settings.permalink` per site (default `/:category/:slug`).
   - Prefix tetap: `/category/{slug}`, `/tag/{slug}`, `/author/{slug}`, `/p/{slug}` untuk halaman statis, `/search?q=` untuk pencarian.
   - Pagination memakai `?page=N`.
   - Prefix dicocokkan lebih dulu, sisanya ke permalink. Artikel di path non-kanonik dialihkan 301.

@@include docs/adr/006-skema-url.md markdown@@

2. Putuskan juga di mana view model dibangun, dan catat sebagai ADR-007. Kode Vue tidak boleh memanggil core (driver `pg` rusak di bundle SSR Vue). Karena itu, halaman dirender penuh di server dan view model dibangun di sisi Nitro (middleware). Tautan di template berupa `<a href>` biasa:

@@include docs/adr/007-render-halaman-server.md markdown@@

3. Lengkapi repository untuk kebutuhan view model:
   - `content.getMediaByIds(siteId, ids)`: media untuk block gambar di isi artikel, hanya milik site itu. Daftarkan di test isolasi antar-site (`repositories.test.ts`), dan tambahkan test bahwa id media site lain tidak ikut kembali.
   - Target menu `ARTICLE` membawa `publishedAt`, karena permalink boleh memakai `:year` dan `:month`.

4. Tulis pembuat URL di `packages/core/src/views/urls.ts`. Inilah satu-satunya tempat yang tahu pola URL. Tahun dan bulan permalink dihitung di zona waktu site, jadi artikel yang terbit 1 Desember pukul 03.00 WIB masuk `/2026/12/...` walau server berjalan di UTC. `RESERVED_SEGMENTS` mencatat kata yang tidak boleh dipakai sebagai slug:

@@include packages/core/src/views/urls.ts ts@@

5. Tulis pencocok route di `routes.ts`. Fungsi ini murni: prefix tetap dicocokkan dulu, lalu pola permalink dengan format token yang ketat. Normalisasi slash di ujung dan parsing `?page=` ada di file yang sama:

@@include packages/core/src/views/routes.ts ts@@

6. Tulis format tanggal di `format.ts`. Tanggal selalu memakai locale dan zona waktu site:

@@include packages/core/src/views/format.ts ts@@

7. Uji URL, route, dan tanggal:

@@include packages/core/src/views/urls-routes.test.ts ts@@

8. Tulis pembangun halaman di `build-page.ts`. Fungsi `build({ site, pathname, searchParams })` mengembalikan salah satu dari (file di bawah sudah memuat tambahan SEO dan `origin` dari bab "Menambahkan Embed, SEO, dan Feed", serta section home dari bab "Menyusun Halaman Depan dari Section"):
   - `render` dengan status 200 atau 404, berisi `chrome` (identitas site, menu dengan URL jadi, tanggal hari ini) dan `vm` (view model halaman);
   - `redirect`: slash di ujung, artikel di path non-kanonik, atau aturan di tabel `redirects` (dicek sebelum 404).

   Aturan lain yang perlu diperhatikan:
   - `?page` yang tidak valid atau di luar jangkauan menghasilkan 404. Listing kosong di halaman 1 tetap 200.
   - Artikel featured tampil di atas home halaman 1 dan tidak diulang di daftar terbaru.
   - Block yang dilewati dan block gambar yang medianya tidak ada dikumpulkan di `issues` untuk log, tidak membuat halaman gagal.

@@include packages/core/src/views/build-page.ts ts@@

9. Ekspor modul `views` dari `packages/core/src/index.ts` (lihat bab repository).

10. Uji pembangun halaman terhadap database seed dengan jam dipatok. Ukuran halaman diset 1 agar pagination ikut teruji dengan data sedikit:

@@include packages/core/src/views/build-page.test.ts ts@@

11. Di `apps/web`, buat satu pembangun halaman per proses (`useFeedBuilder` menyusul di bab "Menambahkan Embed, SEO, dan Feed"):

@@include apps/web/server/utils/pages.ts ts@@

12. Bangun halaman di middleware, setelah site ditemukan. Di bab ini theme dan view model dimuat paralel; sejak bab "Menyusun Halaman Depan dari Section" theme diselesaikan lebih dulu (file di bawah sudah versi itu). Redirect langsung dikirim dari middleware, `issues` dicatat ke log, dan hasilnya disimpan di `event.context.page`. Perhitungan `siteOrigin` dan prefix feed ditambahkan di bab "Menambahkan Embed, SEO, dan Feed":

@@include apps/web/server/middleware/site.ts ts@@

@@include apps/web/shared/types/site-context.d.ts ts@@

13. Ganti plugin `site.server.ts` (versi di bawah dari bab "Menyusun Halaman Depan dari Section": theme sudah diselesaikan di middleware): tidak lagi membangun chrome sementara, cukup menyalin `event.context.page` ke state dan memasang status 404 lewat `setResponseStatus`. Request yang sampai ke renderer tanpa halaman (mis. `/api/tidak-ada`) juga dijawab 404:

@@include apps/web/app/plugins/site.server.ts ts@@

@@include apps/web/app/composables/useSiteTheme.ts ts@@

14. Render view di `app.vue`. Komponen view dipilih dari registry template lewat `vm.view`, lalu dibungkus layout. Bagian `useSeoMeta` dan `link` dijelaskan di bab "Menambahkan Embed, SEO, dan Feed". Di bab "Membangun Login Admin", isi `app.vue` ini pindah ke `app/pages/[...slug].vue` (import registry menjadi `'../templates'`) dan `app.vue` tinggal `<NuxtPage />`; file di bawah adalah lokasi barunya:

@@include apps/web/app/pages/[...slug].vue vue@@

15. Uji semua jenis halaman di dev:

```bash
pnpm dev
for p in / /review/ponsel-lipat-makin-murah /gadget/ponsel-lipat-makin-murah /gadget/ponsel-lipat-murah \
         /category/gadget /category/gadget/ /tag/android /author/budi-santoso /p/tentang-kami \
         '/search?q=ponsel' '/?page=9' /tidak/ada; do
  curl -s -o /dev/null -w "%{http_code} %{redirect_url}  $p\n" -H 'Host: tekno.localhost' "http://127.0.0.1:3000$p"
done
# 200 untuk halaman yang ada; 301 untuk path non-kanonik, redirect lama, dan slash di ujung;
# 404 untuk ?page=9 dan /tidak/ada
```

16. Build produksi, jalankan smoke test dengan `SMOKE_HOSTS`, lalu `pnpm check`. Buka juga beberapa halaman di browser dan periksa console. Peringatan hidrasi berarti state server dan browser tidak sama.

# Menambahkan Embed, SEO, dan Feed

1. Bangun URL iframe embed di core (`packages/core/src/content/embed.ts`), bukan dari HTML yang ditempel penulis:
   - Hanya host yang dikenal dan `https`. YouTube diarahkan ke `youtube-nocookie.com` (tanpa cookie pelacak sebelum video diputar); Vimeo dengan `dnt=1`.
   - Id video divalidasi ketat, jadi URL yang disisipi karakter HTML atau domain mirip (`youtube.com.evil.example`) tidak menghasilkan iframe.
   - X tidak punya URL iframe tanpa script widget mereka, jadi tetap tampil sebagai tautan.

@@include packages/core/src/content/embed.ts ts@@

@@include packages/core/src/content/embed.test.ts ts@@

2. Tambahkan `embedSrc: string | null` ke block embed di `view-models.ts` (menambah field = aman untuk kontrak), lalu isi di `build-page.ts` dengan `embedSrc(block.provider, block.url)`.

3. Render iframe di `BlockRenderer.vue` hanya dari `embedSrc`, dengan `sandbox`, `loading="lazy"`, `title`, dan rasio 16:9 dari CSS. Tanpa `embedSrc`, tampil tautan keluar. Tipe block yang tidak dikenal tidak cocok dengan cabang mana pun, jadi tidak merender apa-apa:

@@include templates/base/src/components/BlockRenderer.vue vue@@

4. Baca kolom `seo` konten (skema ketat `contentSeoSchema` untuk menulis dari admin ditambahkan di bab "Menyimpan Konten dari Admin"). Bentuknya mengikuti komentar DDL: `title`, `description`, `canonical`, `og_image_id`, `robots`. Setiap key divalidasi sendiri; nilai yang salah diabaikan, bukan menggagalkan halaman:

@@include packages/core/src/content/seo.ts ts@@

@@include packages/core/src/content/seo.test.ts ts@@

5. Tulis pembangun metadata `<head>` di `packages/core/src/views/seo.ts`:
   - Title lewat `settings.seo.titleTemplate`. Home memakai nama site dan tagline. Listing halaman ke-N diberi akhiran " – Halaman N" agar tidak ada judul ganda.
   - Description: kolom `seo` konten, lalu ringkasan konten, lalu `settings.seo.defaultDescription`.
   - Canonical dan `og:url` absolut di domain **primary**; 404 tanpa canonical.
   - Pencarian dan 404 `noindex, follow`.
   - `og:image`: `seo.og_image_id` konten, lalu gambar konten, lalu `settings.seo.defaultOgImageId`.

@@include packages/core/src/views/seo.ts ts@@

6. Di `build-page.ts`, setiap jenis halaman sekarang mengembalikan view model **dan** bahan SEO-nya (`SeoInput`). Satu fungsi `render` memuat media OG yang dibutuhkan, lalu memanggil `buildSeo`. `PageRequest` mendapat field `origin` (origin domain primary) untuk URL absolut. File lengkapnya ada di bab sebelumnya.

7. Uji SEO terhadap data seed, dan uji body rusak dengan repository palsu tanpa database (tipe block tidak dikenal, block image rusak, media yang hilang, embed). Test ini menemukan bug pesan log: nomor block untuk media yang hilang dihitung dari daftar setelah block rusak dibuang, sehingga menunjuk posisi yang salah. Pesannya kini menyebut id media. Lihat `build-page.test.ts` di bab sebelumnya.

8. Tambahkan `content.listSitemapEntries(siteId)`: semua artikel dan halaman yang tampil (maksimal 50.000 artikel, batas satu file sitemap), kategori ACTIVE, serta tag dan penulis yang punya artikel tampil. Daftarkan di test isolasi antar-site (lihat bab repository).

9. Tulis pembangun feed di `packages/core/src/feeds/feeds.ts`: `renderSitemap`, `renderRss` (RSS 2.0, `guid` berupa id artikel agar tidak berubah walau URL berganti), `renderRobots`, dan `createFeedBuilder` yang mengambil data dari repository:

@@include packages/core/src/feeds/feeds.ts ts@@

@@include packages/core/src/feeds/feeds.test.ts ts@@

10. Ekspor `content/embed`, `content/seo`, `views/seo`, dan `feeds/feeds` dari `packages/core/src/index.ts`.

11. Hitung origin domain primary di middleware dan simpan di `event.context.siteOrigin`. Skema mengikuti request atau `X-Forwarded-Proto`, port ikut bila ada (dev `:3000`). Tambahkan `/sitemap.xml`, `/robots.txt`, `/rss.xml` ke daftar prefix non-halaman, dan teruskan `origin` ke `usePageBuilder().build(...)`:

@@include apps/web/server/middleware/site.ts ts@@

@@include apps/web/shared/types/site-context.d.ts ts@@

@@include apps/web/server/utils/pages.ts ts@@

12. Buat tiga route feed dengan satu helper bersama. Host tak dikenal sudah ditolak middleware, alias sudah dialihkan ke primary:

@@include apps/web/server/utils/feed-response.ts ts@@

@@include apps/web/server/routes/sitemap.xml.get.ts ts@@

@@include apps/web/server/routes/rss.xml.get.ts ts@@

@@include apps/web/server/routes/robots.txt.get.ts ts@@

13. Pasang metadata di `app.vue` (sejak bab "Membangun Login Admin": `app/pages/[...slug].vue`) dengan `useSeoMeta` (title, description, robots, Open Graph, Twitter card, `article:*`) dan `useHead` (canonical, tautan RSS, favicon). Tipe `link` di unhead dibedakan per nilai `rel`, jadi array-nya ditulis sebagai union tiga bentuk objek:

@@include apps/web/app/pages/[...slug].vue vue@@

@@include apps/web/app/composables/useSiteTheme.ts ts@@

14. Uji di dev, lalu validasi XML dengan parser:

```bash
pnpm dev
curl -s -H 'Host: tekno.localhost:3000' http://127.0.0.1:3000/review/ponsel-lipat-makin-murah | grep -o '<link rel="canonical"[^>]*>\|<meta property="og:[^>]*>'
for f in sitemap.xml rss.xml; do
  curl -s -H 'Host: tekno.localhost:3000' http://127.0.0.1:3000/$f > /tmp/$f
  python3 -c "import xml.dom.minidom as m; m.parse('/tmp/$f'); print('$f valid')"
done
curl -s -H 'Host: kuliner.localhost:3000' http://127.0.0.1:3000/robots.txt
```

15. Di build produksi, pastikan feed dari host tak dikenal dijawab 404, lalu jalankan `pnpm check`.

# Membuktikan Isolasi Antar-Site

1. Pahami apa yang harus dibuktikan. Gate tahap ini: dua domain dari satu server tampil berbeda, dan request paralel tidak saling tertukar. Bug yang dicari adalah state global di SSR: data satu request disimpan di variabel modul, lalu dibaca request lain yang berjalan bersamaan. Bug ini tidak terlihat bila halaman dibuka satu per satu, jadi harus diuji dengan banyak request sekaligus terhadap server hasil build.

2. Pindahkan cara menjalankan server hasil build ke modul bersama, agar smoke test dan test gate memakai kode yang sama:

@@include apps/web/scripts/lib/built-server.mjs js@@

@@include apps/web/scripts/smoke-build.mjs js@@

3. Tulis test gate `apps/web/scripts/gate-parallel.mjs` (file di bawah sudah versi bab "Membuat Template Kedua": kuliner memakai template news, dan halaman `/` punya penanda section):
   - Penanda setiap site diambil dari data seed: judul, kelas root template, aturan token CSS, logo, item menu, dan nama site.
   - Request ke beberapa jenis halaman di kedua domain diacak, lalu dikirim 32 sekaligus (default 240 request).
   - Setiap respons wajib memuat semua penanda site-nya sendiri dan tidak boleh memuat satu pun penanda site lain, termasuk di payload Nuxt.

@@include apps/web/scripts/gate-parallel.mjs js@@

4. Tambahkan script `"gate": "node --env-file-if-exists=../../.env scripts/gate-parallel.mjs"` di `apps/web/package.json`, lalu jalankan:

```bash
pnpm build
pnpm --filter @framework/web gate
# [gate] 240 request ke 2 domain, 32 paralel, ... ms
# [gate] OK: setiap respons hanya memuat data site-nya sendiri
```

5. Buktikan test ini memang bisa gagal. Sisipkan sementara state global di middleware: simpan halaman yang sudah dibangun di variabel modul, tunggu sebentar, lalu baca kembali. Build ulang dan jalankan gate; hasilnya harus GAGAL dengan respons yang memuat judul, logo, dan menu site lain. Kembalikan file, build ulang, dan pastikan gate hijau lagi.

```ts
// SEMENTARA, jangan di-commit
let lastPage: unknown
// ...
lastPage = { status: built.status, ...built.page }
await new Promise((r) => setTimeout(r, 5))
event.context.page = lastPage as typeof event.context.page
```

   Pastikan bug yang disisipkan memang memengaruhi isi halaman. Menimpa `event.context.site` setelah halaman dibangun, misalnya, tidak mengubah output dan tidak membuktikan apa-apa.

6. Masukkan gate ke job CI `build`, setelah smoke test dengan database (file lengkap di bab CI).

7. Tambahkan snapshot view model per jenis halaman. View model adalah kontrak publik template, jadi perubahannya harus terlihat sebagai diff file `.snap` saat review:
   - Chrome kedua site disnapshot sekali; setiap jenis halaman (home, artikel, halaman, kategori, tag, penulis, pencarian, 404, redirect) disnapshot berisi status, `vm`, `seo`, dan `issues`.
   - Jam dipatok. Kolom `updated_at` seed berisi waktu saat seed dijalankan, jadi diganti penanda tetap agar snapshot sama di setiap mesin dan di CI.
   - Di CI, Vitest tidak menulis snapshot baru, sehingga snapshot yang hilang atau berbeda membuat job gagal.

@@include packages/core/src/views/view-models.snapshot.test.ts ts@@

8. Jalankan sekali untuk menulis snapshot, periksa isinya, lalu commit file `packages/core/src/views/__snapshots__/view-models.snapshot.test.ts.snap`. Setelah perubahan view model yang disengaja:

```bash
pnpm vitest run packages/core/src/views -u
git diff packages/core/src/views/__snapshots__/
```

9. Jalankan `pnpm check`, build, smoke, dan gate. Bila semuanya hijau dan pipeline CI hijau, tahap tampilan pertama selesai.

# Menyusun Halaman Depan dari Section

1. Pahami masalahnya. Setiap site menyimpan susunan halaman depan di kolom `site_themes.layouts`, misalnya `[{ "type": "hero", "props": { "source": "featured", "limit": 1 } }, { "type": "latest-grid", "props": { "limit": 6 } }]`. Data setiap section diambil core, tetapi sampai bab sebelumnya theme baru diselesaikan di plugin Vue, setelah view model jadi. Ada dua hambatan lain: Nitro tidak bisa meng-import manifest template karena manifest ikut meng-import `.vue` dan `.css`, dan contoh di guide menaruh komponen section di setiap template, padahal semua template memakai komponen base. Keputusannya dicatat sebagai ADR:

@@include docs/adr/008-kontrak-section.md markdown@@

2. Tulis kontrak section di `packages/template-kit/src/sections.ts`:
   - `defineSection({ props, data })`: skema props Zod (field opsional memakai `.default()`) dan fungsi yang mengubah props menjadi permintaan data `{ source, slug?, limit }`.
   - `resolveLayout`: memvalidasi layout satu halaman. Item yang rusak dilewati dan dicatat; layout yang tidak ada, bukan array, atau tidak menyisakan section valid diganti `defaultLayouts`. Array kosong berarti site sengaja tanpa section (home tampil seperti sebelum ada section). Versi pertama memperlakukan array kosong sama dengan "tidak ada"; itu diubah sebelum form layout di admin dibuat, karena admin harus bisa mematikan section. Nama seperti `toString` tidak boleh dianggap section, jadi pencarian memakai `Object.hasOwn`.
   - `SECTION_LIMITS`: 8 section per halaman dan 12 artikel per section. `limit` di luar batas dijepit, dan permintaan data dicek ulang apa pun skema props-nya.

@@include packages/template-kit/src/sections.ts ts@@

3. Pecah `manifest.ts` menjadi dua fungsi (file lengkap di bab "Membangun Sistem Template"):
   - `defineManifest`: key, versi, tokens, options, menu, slot iklan, `sections`, dan `defaultLayouts`. Tidak ada komponen, jadi aman di-import server. Template turunan mewarisi section induknya dan tidak boleh mendefinisikan section sendiri. `defaultLayouts` harus bersih; manifest dengan layout bawaan yang salah gagal saat di-import.
   - `defineTemplate({ manifest, extends, layout, views })`: manifest + komponen. `extends` harus menunjuk definisi dengan key yang sama dengan induk manifest.

4. Di `theme.ts`, buat registry generik (`createTemplateRegistry<T extends TemplateManifest>`), sehingga server cukup mendaftarkan manifest dan renderer Vue mendaftarkan definisi lengkap. `resolveTheme` kini juga menerima `layouts` dan mengembalikan `layouts.home` yang sudah divalidasi. Di `view-models.ts`, tambahkan `SectionView` dan field `sections` pada `HomeView`. Ekspor `sections.ts` dari `index.ts`.

5. Uji aturan layout:

@@include packages/template-kit/src/sections.test.ts ts@@

6. Di template base, tulis definisi section terpisah dari komponennya. Nama section mengikuti data yang sudah ada di seed (`hero`, `latest-grid`, `headline-list`, `category-strip`; props `categorySlug`):

@@include templates/base/src/sections/definitions.ts ts@@

7. Buat entry `./manifest` base. File ini hanya meng-import template-kit, `config.ts`, dan `definitions.ts`:

@@include templates/base/src/manifest.ts ts@@

8. Daftarkan entry itu di `exports` `package.json` base (`"./manifest": "./src/manifest.ts"`), lalu ubah `index.ts` base menjadi `defineTemplate({ manifest, layout, views })` dengan import CSS (file lengkap di bab "Membangun Sistem Template").

9. Tulis komponen section di `templates/base/src/sections/`. Semuanya netral dan memakai komponen yang sudah ada (`ArticleCard`, `ArticleList`). Setiap section punya kelas `section section--<type>` sebagai kait CSS template, judul `<h2>` dengan `id` dari nomor urut section (stabil antara server dan browser, jadi aman untuk hidrasi), dan tidak merender apa pun bila artikelnya kosong (kecuali `latest-grid`, yang menampilkan teks "Belum ada artikel."):

@@include templates/base/src/sections/props.ts ts@@

@@include templates/base/src/sections/SectionHeading.vue vue@@

@@include templates/base/src/sections/HeroSection.vue vue@@

@@include templates/base/src/sections/LatestGridSection.vue vue@@

@@include templates/base/src/sections/HeadlineListSection.vue vue@@

@@include templates/base/src/sections/CategoryStripSection.vue vue@@

10. Petakan tipe ke komponen dengan key yang sama seperti `definitions.ts`. Tipe `Record<BaseSectionType, Component>` membuat typecheck gagal bila satu section tidak punya komponen:

@@include templates/base/src/sections/components.ts ts@@

11. Di `HomeView.vue`, bila `vm.sections` tidak kosong, render setiap section lewat `sectionComponents`, lalu pagination daftar terbaru. Tipe tanpa komponen dilewati. Bila kosong, tampilkan home lama (`featured` + `latest`). Gaya netral section (`.section`, `.section__head`, `.headline-list`) ada di `base.css`. Keduanya ditampilkan di bab "Membangun Sistem Template".

12. Pindahkan manifest magazine ke `src/manifest.ts` dan tambahkan `defaultLayouts`. `index.ts` magazine tinggal menggabungkan manifest, induk, dan CSS (file di bawah sudah versi 1.1.0 dari bab "Memigrasi Config Theme Antar-Versi"):

@@include templates/magazine/src/manifest.ts ts@@

13. Di core, `PageRequest` mendapat field `layouts` (hasil `resolveTheme`). Fungsi `sectionViews` di `build-page.ts` menjalankan permintaan setiap section:
    - Section dijalankan berurutan. Artikel yang sudah tampil dikecualikan langsung di query lewat opsi baru `excludeIds` pada `listPublishedArticles` (`NOT IN`, paling banyak 200 id), jadi setiap section tetap terisi penuh bila artikelnya cukup. Versi pertama mengambil lebih banyak artikel lalu membuang yang ganda; code review menemukan cara itu gagal bila total limit section melewati batas 50 per query.
    - Sumber `category` dan `tag` juga mengambil nama dan URL-nya untuk judul dan tautan "Lihat semua". Kategori atau tag yang tidak ada di site itu membuat section dilewati dan dicatat, sehingga slug milik site lain tidak pernah terbaca.
    - Batas jumlah section dan `limit` dijaga ulang di sini.
    - Halaman 1 mengisi `sections` dan mengosongkan `featured` dan `latest`. Bila semua section dilewati, `latest` diisi daftar terbaru agar halaman tidak kosong.
    - `?page=N` (N ≥ 2) menjadi arsip terbaru yang dimulai dari artikel paling baru. Code review menemukan bahwa bila `?page=2` tetap dimulai dari artikel ke-11, artikel ke-7 sampai ke-10 (grid magazine menampilkan 6) tidak terjangkau dari mana pun.

14. Uji di `build-page.test.ts` (bab "Membangun Halaman Publik dari View Model"): artikel ganda tidak diulang, section berikutnya tetap terisi, `?page=N` menjadi arsip tanpa artikel yang terlewat, kategori milik site lain dilewati, dan batas dijaga core. Tambahkan dua snapshot home dengan section memakai layout seed, lalu perbarui snapshot dan periksa diff-nya:

```bash
pnpm vitest run packages/core/src/views -u
git diff packages/core/src/views/__snapshots__/
# home lama hanya bertambah "sections": []; dua snapshot baru "home dengan section"
```

15. Di aplikasi web, buat registry manifest untuk server. Issue theme dicatat sekali per proses di sini, tidak lagi di plugin Vue:

@@include apps/web/server/utils/templates.ts ts@@

16. Ubah middleware: `resolveSiteTheme` dipanggil dulu, lalu `theme.layouts` diteruskan ke `usePageBuilder().build(...)`, dan `event.context.theme` berisi `ResolvedTheme`. Plugin `site.server.ts` hanya menyalin field yang dibutuhkan renderer (tipe `PublicTheme` di `useSiteTheme.ts`); `issues` dan `layouts` tidak ikut payload Nuxt yang bisa dibaca siapa pun dari source halaman. Tambahkan paket template ke `nitro.externals.inline` di `nuxt.config.ts`. File-file itu ditampilkan di bab-bab sebelumnya.

    Daftar template kini ada di dua tempat, jadi uji keduanya sama:

@@include apps/web/server/utils/templates.test.ts ts@@

17. Tambahkan test arsitektur yang menelusuri import entry `./manifest` setiap template, termasuk import tidak langsung lewat paket workspace lain, dan gagal bila sampai ke `.vue` atau `.css`. Test kontrol memastikan penelusurnya memang menemukan `.vue`/`.css` dari entry utama:

@@include tests/template-manifest.test.ts ts@@

18. Jalankan semua pemeriksaan, lalu buka kedua site di browser:

```bash
pnpm check
pnpm build && pnpm --filter @framework/web smoke && pnpm --filter @framework/web gate
pnpm dev
# http://tekno.localhost:3000   -> section--hero, section--latest-grid
# http://kuliner.localhost:3000 -> section--headline-list (masih template base sampai template news ada)
# Strip kategori tidak tampil di data seed: semua artikelnya sudah muncul di section sebelumnya.
```

# Membuat Template Kedua

1. Pahami tujuannya. Template kedua membuktikan kontrak template: site kuliner harus tampil jelas berbeda dari site teknologi tanpa satu pun komponen sendiri dan tanpa mengubah core. Yang boleh dipakai hanya token, opsi, layout section, dan CSS di bawah `.tpl-news`.

2. Rancang tampilannya dulu, sebelum menulis CSS:
   - Warna dan font sudah ditentukan token theme site (merah cabai, permukaan krem, Merriweather untuk judul, Source Sans 3 untuk isi), jadi pembeda harus datang dari struktur, bukan warna.
   - Halaman depan dibuka dengan daftar judul (`headline-list`), bukan kartu besar bergambar seperti magazine. Judul pertama dibuat besar dengan serif, judul berikutnya dalam dua kolom bergaris vertikal. Hanya bagian ini yang dibuat mencolok; sisanya tenang.
   - Kartu berupa media horizontal (gambar kiri, teks kanan) tanpa bayangan, dipisah garis tipis.
   - Garis tebal warna primer di bawah menu dan di atas footer; judul section diberi garis tebal di atasnya.
   - Hindari label huruf kapital dan pemisah `·`; label kategori cukup teks tebal berwarna primer.

3. Buat paket `templates/news`. Seperti magazine, ada dua entry: `./manifest` (data saja, untuk server) dan entry utama (manifest + CSS):

@@include templates/news/package.json json@@

@@include templates/news/src/manifest.ts ts@@

@@include templates/news/src/index.ts ts@@

4. Tulis CSS-nya. Setiap selector diawali `.tpl-news` (dijaga `tests/template-css.test.ts`). Kolom ganda daftar judul hanya di layar lebar; di ponsel semuanya satu kolom:

@@include templates/news/src/styles.css css@@

5. Uji manifest news: semua view, layout, dan section dipakai bersama dari base, token dan layout bawaan berbeda, dan config theme site kuliner lolos tanpa issue. Test template hanya boleh meng-import template-kit dan base, jadi pembandingnya base, bukan magazine:

@@include templates/news/src/manifest.test.ts ts@@

6. Daftarkan news di kedua registry (`server/utils/templates.ts` untuk manifest, `app/templates.ts` untuk definisi lengkap) dan tambahkan `"@framework/template-news": "workspace:*"` di `apps/web/package.json`, lalu jalankan `pnpm install`. Test `server/utils/templates.test.ts` gagal bila news hanya didaftarkan di salah satunya.

7. Rapikan config theme site kuliner. Opsi yang tidak ada di skema template dicatat sebagai `key tidak dikenal` setiap server start. Karena template news baru dibuat sekarang, config itu cukup diperbaiki langsung (di seed dan di database dev), tanpa migrasi config. Untuk template yang sudah dipakai, perubahan seperti ini harus lewat `migrateConfig` (bab berikutnya).

8. Perbarui penanda gate: site kuliner kini `class="tpl tpl-news"` dan `.tpl-news{--color-primary:...}`, dan halaman `/` setiap site wajib memuat section dari layout-nya (`section--hero` dan `section--latest-grid` untuk tekno, `section--headline-list` untuk kuliner).

9. Jalankan pemeriksaan, lalu bandingkan kedua site di browser, di layar lebar dan di ponsel:

```bash
pnpm check
pnpm build
SMOKE_HOSTS=tekno.localhost=magazine,kuliner.localhost=news pnpm --filter @framework/web smoke
# [smoke] tekno.localhost/ -> 200 class="tpl tpl-magazine"
# [smoke] kuliner.localhost/ -> 200 class="tpl tpl-news"
pnpm --filter @framework/web gate
pnpm dev
```

10. Periksa gate milestone: news selesai tanpa komponen sendiri dan tanpa mengubah core. Perubahan core yang dibutuhkan section home sudah dicatat di ADR-008 pada bab sebelumnya.

# Memigrasi Config Theme Antar-Versi

1. Pahami masalahnya. Setiap site menyimpan config theme (`tokens`, `options`, `layouts`) bersama versi template saat config itu disimpan (`site_themes.template_version`). Saat template naik versi dan bentuk config-nya berubah, config lama harus diubah ke bentuk baru sebelum divalidasi. Tanpa itu, nilai lama dibuang sebagai "key tidak dikenal" di setiap start, atau lebih buruk lagi, dipakai dengan arti yang salah.

2. Contoh nyatanya: config magazine 1.0.0 menyimpan slot iklan di `options.adSlots`, padahal slot iklan seharusnya dideklarasikan manifest, bukan diatur per site. Log server mencatat `options.adSlots: key tidak dikenal` setiap start. Magazine 1.1.0 memindahkan deklarasi slot ke `adSlots` di manifest dan membawa migrasi yang membuang `options.adSlots` dari config lama.

3. Tentukan arti kunci migrasi. Contoh di guide (`'1.0.0': (cfg) => cfg`) tidak menjelaskan apakah kuncinya versi asal atau versi tujuan. Pilih versi TUJUAN: config untuk versi S dengan template terpasang T menjalankan semua migrasi berkunci K, S < K ≤ T, urut naik. Dengan kunci versi asal, config yang disimpan untuk versi patch tanpa kunci sendiri (mis. 1.0.3) tidak akan pernah dimigrasi. Keputusan ini dicatat di ADR-008 butir 8.

4. Tulis `packages/template-kit/src/migrations.ts`:
   - `compareVersions` membandingkan semver per angka (1.10.0 lebih baru dari 1.9.0, yang salah bila dibandingkan sebagai teks).
   - `migrateConfig` menjalankan rantai migrasi terhadap salinan config (`structuredClone`), jadi migrasi boleh mengubah argumennya tanpa merusak data asli.
   - Versi tersimpan lebih baru dari terpasang (mis. setelah rollback deploy), versi tersimpan bukan semver, atau migrasi yang melempar error: hasilnya gagal dengan alasan yang jelas.
   - `migrationProblems` memeriksa manifest: kunci harus semver dan tidak lebih baru dari versi template, dan setiap versi mayor X ≥ 2 wajib punya migrasi `X.0.0` (aturan ADR-005).

@@include packages/template-kit/src/migrations.ts ts@@

5. Sambungkan ke manifest dan registry (keduanya ditampilkan di bab "Membangun Sistem Template"):
   - `defineManifest` menerima `migrateConfig`, memeriksanya dengan `migrationProblems`, dan menyimpannya di manifest. Migrasi tidak diwariskan: migrasi magazine tidak berlaku untuk template yang memperluas magazine.
   - `resolveTheme` menjalankan migrasi sebelum validasi token, opsi, dan layout. Bila gagal, config diabaikan (default template) dan alasannya dicatat; halaman tetap tampil.
   - Baris database tidak ditulis ulang saat render. Config akan ditulis dalam versi terpasang saat disimpan dari admin.

6. Uji rantai migrasi:

@@include packages/template-kit/src/migrations.test.ts ts@@

7. Naikkan magazine ke 1.1.0. Slot iklan pindah ke `adSlots` manifest, dan migrasi `1.1.0` membuang `options.adSlots` hanya bila ada:

@@include templates/magazine/src/manifest.ts ts@@

8. Uji magazine: config 1.0.0 dari seed dimigrasi tanpa issue, config tersimpan tidak berubah, dan config yang sudah 1.1.0 tetapi masih membawa `adSlots` tetap dicatat (migrasi hanya untuk versi lama):

@@include templates/magazine/src/manifest.test.ts ts@@

9. Jalankan pemeriksaan. Log server tidak lagi memuat peringatan `[theme]` untuk kedua site:

```bash
pnpm check
pnpm build
SMOKE_HOSTS=tekno.localhost=magazine,kuliner.localhost=news pnpm --filter @framework/web smoke
pnpm --filter @framework/web gate
# tanpa baris "[theme] site kabar-tekno: options.adSlots: key tidak dikenal"
```

# Memeriksa Hidrasi di Browser

1. Pahami apa yang tidak tertangkap test lain. Test render SSR, snapshot, smoke, dan gate hanya membaca HTML dari server. Hydration mismatch baru terlihat di browser: Vue membandingkan HTML server dengan hasil render ulangnya, dan bila berbeda (mis. tanggal atau angka acak yang dihitung dua kali), halaman bisa berkedip atau kehilangan interaksi. Komponen section baru menampilkan tanggal, jadi perlu dicek di browser sungguhan.

2. Pasang Playwright sebagai devDependency aplikasi web, dengan versi yang dipatok, lalu unduh Chromium sekali:

```bash
pnpm --filter @framework/web add -D playwright@1.49.1
pnpm --filter @framework/web exec playwright install chromium
```

   Paket `playwright` tidak mengunduh browser saat `pnpm install`, jadi CI tidak terbebani. Skrip ini memang hanya untuk lokal.

3. Tulis `apps/web/scripts/browser-check.mjs`:
   - Satu contoh per jenis halaman di kedua site (home, arsip `?page=2`, artikel, kategori, tag, penulis, pencarian, halaman statis, 404), di lebar desktop dan ponsel.
   - Halaman gagal bila status tidak sesuai, aplikasi Vue tidak terpasang (`#__nuxt.__vue_app__`), atau ada peringatan, console error, maupun page error. Status 404 milik halaman 404 sendiri dikecualikan.
   - Screenshot full page ke `apps/web/.browser-check/` (masukkan ke `.gitignore`).
   - Targetnya dev server, karena build produksi Vue tidak mencetak peringatan hydration mismatch.
   - `BROWSER_LIB_DIR` diteruskan ke Chromium sebagai `LD_LIBRARY_PATH`, untuk mesin tanpa library sistem Chromium dan tanpa sudo.

@@include apps/web/scripts/browser-check.mjs js@@

4. Tambahkan script `"browser-check": "node scripts/browser-check.mjs"` di `apps/web/package.json`, jalankan `pnpm dev`, lalu di terminal lain:

```bash
pnpm --filter @framework/web browser-check
# [browser] OK    desktop http://tekno.localhost:3000/
# ...
# [browser] OK: 24 halaman ter-hydrate tanpa mismatch atau error
```

5. Bila Chromium gagal start karena `libnss3.so`, `libnspr4.so`, atau `libasound.so.2` tidak ada dan Anda tidak punya sudo, ikuti bagian "Cek di browser" di `docs/dev-setup.md`: unduh paket `.deb`-nya dengan `apt-get download`, ekstrak dengan `dpkg-deb -x`, lalu isi `BROWSER_LIB_DIR`.

6. Buktikan skrip ini bisa gagal. Sisipkan sementara `{{ Math.random() }}` di judul section (`SectionHeading.vue`), jalankan lagi: home tekno harus GAGAL dengan `Hydration text mismatch` dan exit 1. Kembalikan file, restart `pnpm dev` (cache SSR dev server bisa masih menyimpan komponen dari paket workspace di luar `apps/web` walau file sudah kembali), lalu pastikan hijau lagi.

7. Buka screenshot di `apps/web/.browser-check/` untuk membandingkan tampilan magazine dan news di desktop dan ponsel.

8. Tinjau kode dengan code review sebelum menutup tahap ini. Temuan pada tahap template kedua yang diperbaiki:
   - Versi tersimpan seperti `1.01.0` lolos CHECK database tetapi ditolak template-kit, sehingga seluruh config jatuh ke default. Versi kini dibaca sebagai angka, sama dengan CHECK database.
   - Migrasi yang mengembalikan object tanpa `tokens`, `options`, atau `layouts` mereset config tanpa issue. Hasil migrasi kini wajib lengkap.
   - Lompatan mayor tanpa langkah `X.0.0` (termasuk 0.x ke 1.x) lolos tanpa migrasi. Kini gagal dengan alasan yang jelas.
   - Smoke test menerima wrapper template apa pun, jadi template yang diam-diam jatuh ke base tidak tertangkap. `SMOKE_HOSTS` kini menerima `host=template`:

```bash
SMOKE_HOSTS=tekno.localhost=magazine,kuliner.localhost=news pnpm --filter @framework/web smoke
```

   - `browser-check` kini menolak `BASE_URL` tanpa `{host}`, dan di halaman 404 hanya mengabaikan status 404 dokumen itu sendiri, bukan 404 aset lain.


# Membangun Login Admin

1. Putuskan bentuk admin sebelum menulis kode: di host mana admin dilayani, bagaimana dirender, bagaimana sesi disimpan, dan bagaimana admin pertama dibuat tanpa menyentuh database manual. Catat sebagai ADR:

@@include docs/adr/009-admin.md markdown@@

2. Pasang dua dependency. `@node-rs/argon2` untuk hash password (binary prebuilt per platform, tanpa kompilasi native, jadi tidak terhalang aturan pnpm yang memblokir build script), dan `tsx` untuk menjalankan CLI dari source TypeScript:

```bash
pnpm --filter @framework/core add @node-rs/argon2
pnpm add -Dw tsx
pnpm --filter @framework/web add zod@^4.6.7
```

3. Tulis hash password di core. `Algorithm` di `@node-rs/argon2` adalah const enum yang tidak bisa di-import dengan `verbatimModuleSyntax`, jadi nilainya ditulis sebagai konstanta. Email yang tidak ada tetap diverifikasi terhadap hash palsu agar waktu respons mirip:

@@include packages/core/src/auth/password.ts ts@@

@@include packages/core/src/auth/password.test.ts ts@@

4. Baca konfigurasi admin dari environment. Tanpa secret, admin nonaktif; nilai yang diisi tetapi salah menghentikan start:

@@include packages/core/src/auth/admin-config.ts ts@@

@@include packages/core/src/auth/admin-config.test.ts ts@@

5. Tulis pembatas percobaan login. Jam disuntik lewat `now`, sehingga test tidak perlu menunggu 15 menit. Percobaan dicatat di `begin()` sebelum verifikasi password: code review menemukan bahwa bila kegagalan baru dicatat setelah verifikasi (yang async), request paralel lolos semua. IP yang tidak diketahui hanya dibatasi per email:

@@include packages/core/src/auth/login-throttle.ts ts@@

@@include packages/core/src/auth/login-throttle.test.ts ts@@

6. Tulis repository user. Tabel `users` adalah identitas global (tanpa `site_id`), jadi fungsi di sini tidak menerima siteId; akses ke site diturunkan dari `site_members` atau `is_superadmin`. User `DISABLED` dikembalikan tanpa hash agar ditolak dengan pesan yang sama. Daftarkan sebagai `users` di `createRepositories` dan ekspor modul auth dari `packages/core/src/index.ts`:

@@include packages/core/src/repositories/user-repository.ts ts@@

7. Uji repository terhadap database dev. User test dibuat dan dihapus di test itu sendiri; user seed tidak diubah:

@@include packages/core/src/repositories/user-repository.test.ts ts@@

8. Tulis CLI admin pertama. Password dibaca dari prompt tersembunyi (diketik dua kali) atau dari `ADMIN_PASSWORD`, tidak pernah dari argumen. Tambahkan script `"admin:create": "node --env-file-if-exists=../../.env --import tsx scripts/admin-create.ts"` di `apps/web/package.json` dan `"admin:create": "pnpm --filter @framework/web admin:create"` di root, lalu masukkan `apps/web/scripts/**/*.ts` ke `include` di `tsconfig.json` root agar ikut typecheck:

@@include apps/web/scripts/admin-create.ts ts@@

9. Isi `.env` (lihat `.env.example`): `ADMIN_SESSION_SECRET` dari `openssl rand -base64 48` dan `ADMIN_HOST=admin.localhost`. Lalu isi password admin seed:

```bash
pnpm admin:create --email admin@local.test --reset-password
# Password: ********
# Ulangi password: ********
# [admin] password admin@local.test diganti
```

10. Tulis util admin di server: konfigurasi dibaca sekali, sesi dan user selalu per request. Dua hal penting dari security review:
    - Router men-decode percent-encoding sebelum mencocokkan route, sehingga `/api/%61dmin/login` sampai ke handler `/api/admin/login`. Pemeriksaan path harus memakai bentuk yang sama (`routedPath`). Tanpa ini, login lewat domain site publik berhasil dan mendapat sesi.
    - Aturan host dan `Origin` diulang di handler lewat `assertAdminRequest`, yang dipanggil `useAdminSession`, sehingga selisih normalisasi path tidak bisa melewatinya.

@@include apps/web/server/utils/admin.ts ts@@

11. Validasi konfigurasi saat start dan tambahkan penjaga API admin:

@@include apps/web/server/plugins/admin.ts ts@@

@@include apps/web/server/middleware/admin-guard.ts ts@@

12. Di middleware site, tangani path admin sebelum resolusi site (file lengkap di bab "Memilih Site dari Domain Request"): di mode multi, host admin melayani path admin dan mengarahkan path lain ke `/admin`, sedangkan path admin di domain site dijawab 404; di mode single, path admin dilayani di domain site tanpa membangun view model.

13. Tulis route API. Login membuat sesi baru (`clear` lalu `update`) dan tidak pernah mengembalikan hash password:

@@include apps/web/server/api/admin/login.post.ts ts@@

@@include apps/web/server/api/admin/logout.post.ts ts@@

@@include apps/web/server/api/admin/me.get.ts ts@@

14. Mulai memakai `app/pages/`. Isi `app.vue` lama pindah ke `app/pages/[...slug].vue` (halaman publik, tidak berubah), `app.vue` tinggal `<NuxtPage />`, dan admin dijadikan SPA di `nuxt.config.ts`:

```ts
routeRules: {
  '/admin': { ssr: false },
  '/admin/**': { ssr: false },
},
```

   Nama file halaman Nuxt menentukan route (`index.vue`, `login.vue`), jadi matikan aturan `vue/multi-word-component-names` untuk `apps/web/app/pages/**` di `eslint.config.js`.

15. Tulis halaman admin minimal. Tampilan lengkap dibuat di bab "Membangun Layar Admin"; file di bawah sudah versi akhirnya (login bergaya admin, `/admin` mengarahkan ke site pertama, `adminApi` dan pembaca galat field di composable). Beri tipe hasil `$fetch` secara eksplisit; inferensi tipe route Nitro untuk semua route bisa melebihi batas kedalaman TypeScript:

@@include apps/web/app/composables/useAdmin.ts ts@@

@@include apps/web/app/pages/admin/login.vue vue@@

@@include apps/web/app/pages/admin/index.vue vue@@

16. Tulis gate admin terhadap server hasil build, dengan helper request umum `requestWithHost` di `scripts/lib/built-server.mjs` (bab "Membuktikan Isolasi Antar-Site"). Gate memeriksa host admin dan domain site (termasuk path ter-encode), penjaga Origin, login salah dan benar, sesi, logout, rate limit, dan login paralel:

@@include apps/web/scripts/gate-admin.mjs js@@

17. Jalankan, lalu buktikan kasus path ter-encode memang menangkap celahnya. Ganti sementara `routedPath` agar mengembalikan pathname apa adanya dan matikan `assertAdminRequest` di `useAdminSession`, build, dan jalankan gate: hasilnya harus GAGAL, termasuk login yang berhasil lewat `POST /api/%61dmin/login` di domain site. Kembalikan, build ulang, dan pastikan hijau:

```bash
pnpm build
ADMIN_PASSWORD=<password admin> pnpm --filter @framework/web gate:admin
# [gate-admin] OK: 22 pemeriksaan admin lulus
```

18. Masukkan ke job CI `build`: variabel `ADMIN_HOST`, `ADMIN_SESSION_SECRET`, dan `ADMIN_PASSWORD` khusus CI (database dan server CI dibuang setelah job), lalu `pnpm admin:create --email admin@local.test --reset-password` dan `pnpm --filter @framework/web gate:admin` setelah gate isolasi site.

19. Hal lain dari code review yang ikut diperbaiki: segmen `admin` dicadangkan di `RESERVED_SEGMENTS` (`packages/core/src/views/urls.ts`) agar konten tidak memakai path `/admin`; IP klien di belakang reverse proxy dibaca dari entri paling kanan `X-Forwarded-For` hanya bila `TRUST_PROXY=true` (`clientIp`; entri di kirinya bisa diisi klien sesukanya), user yang kehilangan semua site kehilangan sesinya; API admin non-GET di domain alias mode single dijawab 404 karena 301 mengubah POST menjadi GET; `ADMIN_PASSWORD` hanya dipakai CLI tanpa terminal; prompt password menyimpan sisa input yang di-paste; dan hash palsu yang gagal dibuat tidak disimpan.

20. Coba di browser: http://admin.localhost:3000/admin mengarah ke halaman login; setelah login, halaman admin menampilkan nama dan daftar site. Path `/admin` di http://tekno.localhost:3000 harus 404.

# Menyimpan Konten dari Admin

1. Pahami aturannya sebelum menulis. Operasi tulis mengikuti aturan yang sama dengan repository baca: setiap fungsi menerima siteId sebagai argumen pertama, dan setiap baris yang dibaca atau ditulis dibatasi site itu. Tambahannya:
   - Referensi ke data lain (kategori, penulis, media, tag, gambar di body, gambar OG, induk, target menu) harus milik site yang sama. Data site lain dijawab "tidak ditemukan" dengan galat yang rapi, bukan error database.
   - Simpan bersamaan dari dua tab tidak boleh saling menimpa diam-diam (penguncian optimistis).
   - Slug dibuat dari judul bila kosong, unik per site, dan tidak boleh memakai segmen route sistem.
   - Setiap simpan artikel menulis revisi, dan URL publik yang berubah meninggalkan redirect 301.

2. Tulis galat operasi tulis. Lapisan API nanti memetakannya ke 404, 409, dan 422 (pesan validasi berbahasa Indonesia, `editorErrorMap`, ditambahkan di bab "Membangun Layar Admin"):

@@include packages/core/src/editor/errors.ts ts@@

3. Tulis util slug. Huruf beraksen diubah ke huruf dasarnya, hasilnya selalu cocok dengan CHECK `*_slug_format` di database:

@@include packages/core/src/editor/slug.ts ts@@

@@include packages/core/src/editor/slug.test.ts ts@@

4. Tambahkan skema SEO yang ketat untuk menulis di `packages/core/src/content/seo.ts` (`contentSeoSchema`: semua key opsional, key tidak dikenal dan nilai salah ditolak). Skema baca tetap longgar, agar halaman publik tidak gagal karena data lama.

5. Tulis skema input. Perhatikan `publishedAt`: field yang tidak dikirim berarti tanggal tersimpan dipertahankan, sedangkan `null` berarti dikosongkan. Versi pertama menyamakan keduanya, sehingga tanggal terbit tidak pernah bisa dikosongkan (temuan code review):

@@include packages/core/src/editor/inputs.ts ts@@

6. Tulis repository editor. Hal-hal yang mudah terlewat:
   - Tabel tanpa kolom `version` (halaman, kategori, tag, item menu) memakai `updatedAt` sebagai token konkurensi. PostgreSQL menyimpan mikrodetik, Date JavaScript hanya milidetik, jadi pembandingannya memakai `date_trunc('milliseconds', ...)`.
   - Penguncian artikel dijaga dua kali: pengecekan versi di awal, dan `WHERE version = ...` di UPDATE, yang tetap menolak bila dua transaksi lolos pengecekan awal bersamaan.
   - Path lama untuk redirect dihitung dengan URL builder yang sama dengan halaman publik, jadi pola permalink setiap site ikut dihormati. Rantai diratakan (A→B lalu B→C menjadi A→C dan B→C), dan redirect yang berangkat dari path yang kini berisi konten dihapus.
   - Pengecekan slug terjadi sebelum INSERT, jadi dua simpan bersamaan bisa memilih slug yang sama. Pelanggaran unique constraint (kode 23505) diubah menjadi galat field `slug`.
   - Arsip hanya mengubah status, versi, dan revisi, tanpa memvalidasi ulang isi, agar artikel lama dengan data yang tidak lolos aturan tulis terbaru tetap bisa disembunyikan.

@@include packages/core/src/editor/editor-repository.ts ts@@

7. Daftarkan sebagai `editor` di `createRepositories` dan ekspor modul `editor/*` dari `packages/core/src/index.ts`. Tipe daftar artikel admin bernama `AdminArticleQuery` karena `ArticleListQuery` sudah dipakai repository baca.

8. Uji terhadap database dev, tetapi jangan menulis ke site seed. File test lain membaca data seed secara paralel: artikel uji yang terbit di site kuliner sempat membuat test RSS, daftar penulis, dan snapshot home gagal secara acak. Test ini membuat site uji sendiri berstatus `ARCHIVED` (tidak ditemukan resolver dan tidak muncul di daftar site admin) dan menghapusnya di akhir; seluruh isinya ikut terhapus lewat CASCADE:

@@include packages/core/src/editor/editor-repository.test.ts ts@@

9. Cari sumber kegagalan acak yang lain dengan cara yang sama. `repositories.test.ts` membuat site fixture ACTIVE sementara, sehingga test yang mengasumsikan database hanya berisi data seed (`seed-consistency.test.ts` dan daftar site superadmin di `user-repository.test.ts`) kadang ikut membaca data itu. Batasi keduanya ke dua site seed.

10. Buktikan test penguncian bisa gagal: hapus sementara pengecekan versi dan syarat `version` di UPDATE, lalu jalankan; test "versi lama -> conflict" harus GAGAL. Kembalikan, lalu jalankan `pnpm test` beberapa kali berturut-turut untuk memastikan tidak ada lagi kegagalan acak.

# Membangun Layar Admin

1. Rancang tampilan sebelum menulis komponen. Admin adalah ruang kerja satu pemilik yang menulis, menjadwalkan, dan merapikan artikel di beberapa site, jadi tampilannya tenang, padat, dan mudah dipindai:
   - Warna: kertas `#f5f6f4`, panel putih, tinta `#1c2023`, garis `#dcdfdb`, aksen hijau tua `#1f5f4a` untuk aksi utama, dan warna sendiri untuk setiap status (draf, ditinjau, terbit, terjadwal, arsip).
   - Satu keluarga huruf (Inter, di-self-host) dengan angka tabular untuk tanggal; slug memakai huruf monospace karena memang kode.
   - Rail kiri berisi pemilih site dan navigasi; editor artikel dua kolom: judul dan block di kiri, panel terbit, pengelompokan, gambar, dan SEO di kanan.
   - Satu hal yang sengaja menonjol: editor block. Selebihnya tabel bergaris tipis, tanpa kartu berbayang, label huruf kapital, atau panah dekoratif.

2. Tambahkan pesan validasi berbahasa Indonesia di core. Zod 4 punya locale `id`, tetapi pesannya masih teknis ("diharapkan string memiliki >=1 karakter"); kasus yang paling sering diganti kalimat biasa, dan peta pesan dipasang per parse, bukan global:

@@include packages/core/src/editor/errors.ts ts@@

3. Lengkapi core untuk form: `listAuthors` dan `listMedia` (dengan filter `ids` untuk media yang sedang terpasang tetapi di luar halaman pertama) di repository editor, zona waktu dan locale site di daftar site admin (`AdminSite`), dan batas nomor halaman di `normalizePaging` agar `?page=1e20` tidak membuat OFFSET melampaui bigint PostgreSQL.

4. Tulis pembungkus route API per site. Satu tempat untuk sesi, akses site, dan pemetaan galat:

@@include apps/web/server/utils/admin-api.ts ts@@

5. Tulis route di `server/api/admin/sites/[siteId]/`. Setiap route hanya meneruskan body ke repository editor, karena validasi ada di core:

@@include apps/web/server/api/admin/sites/[siteId]/articles/index.get.ts ts@@

@@include apps/web/server/api/admin/sites/[siteId]/articles/[id].put.ts ts@@

   Route lain mengikuti pola yang sama: `articles` (POST, GET satu, arsip, revisi), `pages`, `categories`, `tags` (termasuk DELETE dengan `?updatedAt=`), `menus/[location]` dan item-itemnya, `authors`, `media`.

6. Tanggal terbit diisi dalam zona waktu SITE, bukan zona waktu browser, lalu disimpan sebagai UTC. Hitung selisih zona dengan `Intl.DateTimeFormat`, dua langkah agar tepat di sekitar pergantian DST:

@@include apps/web/app/utils/zoned-time.ts ts@@

@@include apps/web/app/utils/zoned-time.test.ts ts@@

7. Bersihkan isi editor sebelum dikirim. Block kosong dibuang, agar draf berisi judul saja bisa disimpan meski form baru dimulai dengan satu paragraf kosong. SEO tersimpan digabung dengan field yang diedit; tanpa itu, form yang hanya punya sebagian field (halaman, kategori) menghapus canonical, gambar OG, dan robots saat disimpan:

@@include apps/web/app/utils/admin-body.ts ts@@

8. Tulis CSS admin di bawah `.adm`, agar tidak pernah bertabrakan dengan CSS template (`.tpl`) di aplikasi yang sama. Perhatikan dua hal: selector judul editor diperkuat (`.adm input[type='text'].adm-editor__title`) karena gaya umum `.adm input[type='text']` lebih spesifik, dan textarea memakai `field-sizing: content` agar tingginya mengikuti isi:

@@include apps/web/app/assets/admin.css css@@

9. Pakai layout Nuxt untuk kerangka admin. `app.vue` menjadi `<NuxtLayout><NuxtPage /></NuxtLayout>`; halaman publik tidak memakai layout, jadi tetap dirender apa adanya. Logout hanya pindah ke halaman login bila server benar-benar menghapus sesi, agar komputer bersama tidak tertinggal dalam keadaan login. Matikan `vue/multi-word-component-names` juga untuk `app/layouts/**`:

@@include apps/web/app/layouts/admin.vue vue@@

10. Tulis komponen. `MediaSelect` memakai `v-model` lewat computed (dengan `:value`, opsi yang dimuat belakangan tidak ikut terpilih) dan `withDefaults` untuk `allowEmpty` (prop boolean yang tidak dikirim dianggap `false` oleh Vue):

@@include apps/web/app/components/admin/StatusBadge.vue vue@@

@@include apps/web/app/components/admin/MediaSelect.vue vue@@

@@include apps/web/app/components/admin/BlockEditor.vue vue@@

11. Tulis halaman. Daftar artikel memakai key `useAsyncData` yang reaktif (site, status, kata kunci yang ditunda 300 ms, halaman), sehingga data diambil ulang tanpa watcher tambahan. Editor artikel mengirim `publishedAt` hanya bila tanggalnya diubah, agar detik yang tersimpan tidak terpotong setiap kali disimpan:

@@include apps/web/app/pages/admin/[site]/articles/index.vue vue@@

@@include apps/web/app/pages/admin/[site]/articles/[id].vue vue@@

   Halaman lain mengikuti pola yang sama: `pages/` (daftar dan editor halaman statis), `categories.vue` (pohon + form; kategori disembunyikan, tidak dihapus), `tags.vue`, dan `menus.vue` (tab lokasi, pohon item, pilihan target sesuai jenis; artikel yang sedang dipakai menu selalu dimuat ke pilihan).

12. Uji API per site di gate admin dengan user kedua yang hanya anggota satu site, dibuat lewat CLI tanpa terminal:

```bash
ADMIN_PASSWORD=<password> pnpm admin:create --email editor@local.test --name Editor --site kabar-tekno
pnpm build
ADMIN_PASSWORD=<password> pnpm --filter @framework/web gate:admin
# [gate-admin] OK: 30 pemeriksaan admin lulus
```

   Tambahkan perintah `admin:create` yang sama ke job CI `build`, sebelum `gate:admin`.

13. Coba alurnya di browser: login di http://admin.localhost:3000/admin, buka artikel, ubah ringkasan dan simpan, tulis artikel baru dengan judul saja (harus tersimpan sebagai draf), tambahkan daftar, lalu periksa kategori, tag, menu, dan halaman. Jalankan juga `browser-check`: halaman publik harus tetap ter-hydrate tanpa mismatch setelah `app.vue` memakai `<NuxtLayout>`.

