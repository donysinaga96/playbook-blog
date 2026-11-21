# ADR-008: Kontrak section dan manifest server

- Status: Diterima
- Tanggal: 2026-11-21
- Memperbaiki: ADR-005 (kontrak template), ADR-007 (alur render)

## Konteks

M3 menambah layout home berbasis section dari `site_themes.layouts` (mis. magazine: `hero`,
`latest-grid`, `category-strip`; news: `headline-list`, `category-strip`). Menurut guide, core
mengambil data setiap section. Sampai M2, theme baru diselesaikan di plugin Vue
(`app/plugins/site.server.ts`) setelah view model selesai dibangun di Nitro (ADR-007), jadi
core tidak tahu section apa yang harus diisi.

Ada dua hambatan lain:

- Manifest template di-import bersama komponen `.vue` dan CSS (`import './styles.css'`).
  Nitro tidak bisa memuat keduanya, jadi server tidak bisa memakai manifest.
- Contoh manifest di guide menaruh komponen section di paket template (`./sections/Hero.vue`).
  Ini bertentangan dengan ADR-005: semua template memakai komponen dari base.

Gate M3 mengizinkan perubahan core asalkan dicatat sebagai ADR perbaikan kontrak.

## Keputusan

1. **Komponen section hanya ada di base** (`templates/base/src/sections/`) dan dipakai
   bersama. Template memilih susunan dan props section lewat `defaultLayouts` di manifest dan
   `site_themes.layouts` per site, lalu menatanya lewat CSS di bawah kelas root. Template
   turunan tidak boleh mendefinisikan section (`defineManifest` menolaknya).
2. **Section dideklarasikan di manifest base** dengan `defineSection({ props, data })`:
   - `props`: skema Zod, dengan `.default()` untuk field opsional;
   - `data(props)`: permintaan data dengan kosakata dari template-kit, saat ini
     `{ source: 'latest' | 'featured' | 'category' | 'tag', slug?, limit }`.
   Core yang menjalankan permintaan itu; template tetap tidak pernah query. Menambah sumber
   data = versi minor template-kit + dukungan di core.
3. **Satu paket template punya dua entry.** `./manifest` (`defineManifest`) hanya berisi data
   dan skema: key, versi, tokens, options, menu, slot iklan, sections, defaultLayouts. Entry
   utama (`defineTemplate({ manifest, extends, layout, views })`) menambahkan komponen dan
   CSS. `tests/template-manifest.test.ts` memastikan entry `./manifest` tidak menjangkau
   `.vue`/`.css`, termasuk lewat import tidak langsung.
4. **Theme diselesaikan di server sebelum view model.** `server/utils/templates.ts` memegang
   registry manifest; `server/middleware/site.ts` memanggil `resolveTheme` dulu, lalu
   meneruskan `theme.layouts` ke page builder. Hasilnya (`ResolvedTheme`, data JSON) disimpan
   di `event.context.theme`; plugin Vue hanya menyalinnya ke state. Issue theme dicatat sekali
   per proses di server. `app/templates.ts` tetap mendaftarkan definisi lengkap untuk
   komponen; kedua daftar harus berisi template yang sama.
5. **Aturan layout tahan data buruk** (`resolveLayout` di template-kit):
   - item yang bukan `{ type, props }`, tipe tidak dikenal, props tidak valid, atau
     permintaan data yang tidak valid: section dilewati dan dicatat;
   - `layouts.<halaman>` tidak ada, kosong, bukan array, atau tidak menyisakan section valid:
     memakai `defaultLayouts` manifest;
   - batas: paling banyak 8 section per halaman dan 12 artikel per section
     (`SECTION_LIMITS`); `limit` di luar batas dijepit. Core menjaga batas yang sama lagi,
     tanpa bergantung pada validasi pemanggil;
   - `defaultLayouts` milik manifest sendiri harus bersih; manifest yang salah gagal saat
     di-import.
6. **View model home.** `HomeView` mendapat field `sections: SectionView[]` (menambah field =
   aman menurut ADR-005). Untuk site yang punya section (termasuk lewat `defaultLayouts`):
   - halaman 1: `sections` diisi, `featured` dan `latest` kosong. Bila semua section dilewati
     (mis. kategori sudah dihapus), `latest` berisi daftar terbaru agar halaman tidak kosong;
   - `?page=N` (N ≥ 2): arsip terbaru yang dimulai dari artikel paling baru (halaman arsip
     N-1), dengan `totalPages` = jumlah halaman arsip + 1. Ini mengubah arti `?page=N` dari
     ADR-006 untuk site dengan section. Tanpa perubahan ini, artikel di antara jumlah yang
     tampil di section dan `pageSize` tidak terjangkau dari pagination (temuan code review
     21 Nov 2026);
   - section dijalankan berurutan, dan artikel yang sudah tampil di section sebelumnya
     dikecualikan di query (`excludeIds`, paling banyak 200 id), jadi setiap section terisi
     penuh bila artikelnya cukup. Kategori atau tag yang tidak ada di site itu: section
     dilewati dan dicatat.
   Site tanpa section tetap memakai `featured` + `latest` dengan pagination seperti ADR-006.
7. **Diagnosis tidak dikirim ke browser.** Plugin Vue hanya menyalin field theme yang dibutuhkan
   renderer (`templateKey`, `templateVersion`, `rootClass`, `tokens`, `options`, `css`);
   `issues` dan `layouts` tetap di server.

## Alternatif yang ditolak

- **Validasi layout di core.** Core jadi mengenal daftar section dan skema props-nya,
  padahal itu milik template (bertentangan dengan ADR-005).
- **Komponen section di setiap paket template** (contoh di guide). Menggandakan komponen dan
  melanggar keputusan "komponen sama, tampilan berbeda".
- **Theme tetap diselesaikan di plugin Vue, data section diambil lewat request kedua.**
  Menambah satu putaran per halaman dan memecah view model menjadi dua sumber.
- **Satu entry dengan `import()` dinamis untuk CSS.** Tetap ditolak Nitro saat bundling, dan
  aturan "manifest bebas Vue/CSS" tidak bisa diuji.

## Konsekuensi

- Menambah template = daftarkan entry `./manifest` di `server/utils/templates.ts` dan entry
  utama di `app/templates.ts`, plus dependency di `apps/web/package.json`.
  `server/utils/templates.test.ts` gagal bila kedua daftar berbeda.
- Menambah tipe section = definisi di `sections/definitions.ts` + komponen di
  `sections/components.ts` (key sama) di base. Itu versi minor base.
- Theme diselesaikan sebelum view model, jadi query theme dan query halaman tidak lagi
  paralel. Tambahannya satu query ringan per request halaman, ditambah query section yang
  berurutan (paling banyak 8) di halaman 1 home.
- `nitro.externals.inline` memuat paket template agar entry `./manifest` ikut di-bundle.
