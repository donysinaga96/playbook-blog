# ADR-005: Kontrak template

- Status: Diterima
- Tanggal: 2026-11-17

## Konteks

Setiap site punya tampilan berbeda, tetapi alur bisnis, alur data konten, dan komponen UI-nya
sama. Yang berbeda antar site adalah tampilan serta menu dan submenu yang mengikuti konten.
Template harus bisa ditambah dan ditukar tanpa mengubah core.

## Keputusan

1. **Core memegang route dan data; template hanya tampilan.** Template menerima view model dari
   `packages/core` dan tidak pernah query database.
2. **Komponen sama, tampilan berbeda.** Semua template memakai komponen UI dari
   `templates/base`. Perbedaan antar site datang dari design token (CSS variable), CSS
   template, susunan section (`site_themes.layouts`), serta menu dan submenu dari `menus` dan
   `menu_items`. Override komponen adalah pengecualian: hanya bila tampilan yang dibutuhkan
   tidak bisa dicapai lewat token, CSS, atau opsi, dan setiap override dicatat dengan ADR.
3. **Template adalah paket dengan manifest berversi** (`defineTemplate` dari
   `@framework/template-kit`), memakai semver. Versi mayor wajib menyertakan `migrateConfig`.
4. **Arah dependency** dijaga ESLint (`eslint.config.js`) dan diuji di
   `tests/architecture.test.ts`:
   - `templates/*` hanya boleh import `@framework/template-kit` dan `@framework/template-base`;
     tidak boleh `@framework/core`, `@framework/db`, driver database, atau path relatif ke
     `apps/` dan `packages/`.
   - `packages/template-kit` tidak boleh bergantung pada core atau database.
5. **View model adalah kontrak publik.** Menambah field aman; menghapus atau mengganti nama
   field = versi mayor template-kit.

## Alternatif yang ditolak

- **Union TypeScript tertutup berisi daftar template** (dokumen lama). Menambah template berarti
  mengedit core, tanpa versi atau pewarisan.
- **Setiap template punya set komponen sendiri.** Bertentangan dengan kebutuhan bahwa komponen
  UI semua site sama, dan menggandakan pekerjaan setiap ada perubahan komponen.

## Konsekuensi

- `templates/base` harus lengkap dan netral: semua view, header, footer, kartu artikel,
  renderer setiap tipe block, pagination, 404.
- Template kedua (`news`, M3) harus terlihat berbeda jelas tanpa override komponen. Bila itu
  memaksa perubahan core, kontrak diperbaiki saat itu juga dan dicatat sebagai ADR.
- Seluruh halaman dibungkus kelas root (mis. `.tpl-magazine`) agar CSS antar-template tidak
  bocor di mode multi-site.
