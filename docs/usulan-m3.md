# Usulan M3 — Template kedua

Status: menunggu persetujuan (ditulis 20 Nov 2026, dibahas 21 Nov 2026).
Latar belakang dan pemeriksaan poin M3 ada di [TASKS.md](../TASKS.md#m3--template-kedua-titik-evaluasi).
Setelah disetujui, usulan dimasukkan ke rincian M3 di TASKS.md (ditandai [A]–[F]) seperti M2.

## Ringkasan temuan

1. Section home pasti mengubah core: data section diambil core, tetapi theme baru diresolve di plugin Vue setelah view model jadi. Gate M3 lewat jalur "perubahan core dicatat sebagai ADR".
2. Contoh manifest di guide menaruh komponen section di paket template, bertentangan dengan keputusan 17 Nov (semua template memakai komponen base).
3. Contoh `migrateConfig` 1.1.0 di guide hanya identitas; menurut semver guide, minor tidak butuh migrasi.

## Usulan

- **[A] ADR-008 kontrak section.** Komponen section ada di `templates/base/src/sections/` dan dipakai bersama. Template memilih susunan dan props lewat `layouts`/`defaultLayouts` dan menata tampilannya lewat CSS. Base mendefinisikan `sections` di manifest: skema props (Zod) dan `data(props)` yang menyatakan kebutuhan data dengan kosakata dari template-kit (`articles` dengan `source: latest | featured | category | tag`, `slug`, `limit`); core yang mengeksekusi. `HomeView` mendapat field `sections` (menambah field = aman, ADR-005). *Alasan:* gate M3 mengharuskan perubahan core dicatat, dan menaruh section di base menjaga keputusan "komponen sama, tampilan berbeda".
- **[B] Manifest server tanpa Vue/CSS.** Setiap paket template punya entry `./manifest` (key, versi, skema, sections, defaultLayouts, migrateConfig) yang bisa di-import Nitro. Entry utama menambahkan layout, view, dan CSS. Registry dipakai di `server/middleware/site.ts`: theme diresolve dulu, lalu layout home diteruskan ke page builder; plugin Vue hanya memakai hasilnya. *Alasan:* Nitro tidak bisa meng-import `.vue`/`.css` (`magazine/src/index.ts` meng-import `./styles.css`), dan layout harus divalidasi sebelum core mengambil data. *Ditolak:* validasi layout di core, karena core jadi mengenal daftar section dan bertentangan dengan ADR-005.
- **[C] Aturan layout yang tahan data buruk.** Tipe section tidak dikenal atau props tidak valid → section dilewati dan dicatat. `layouts.home` kosong atau tidak valid → `defaultLayouts.home`. Batas `limit` per section dan jumlah section per halaman agar satu baris config tidak memicu query tanpa batas. Artikel yang sudah tampil di section sebelumnya tidak diulang. Section hanya di halaman 1; `?page=N` tetap daftar terbaru + pagination seperti sekarang. *Alasan:* sejalan dengan aturan token/options (nilai salah → default, tidak crash), dan URL `?page` dari ADR-006 tetap berlaku.
- **[D] `migrateConfig` yang menguji transformasi nyata.** Magazine 1.1.0 dengan migrasi `1.0.0 → 1.1.0` yang memindahkan `options.adSlots` lama dari config tersimpan (slot iklan dideklarasikan di manifest, bukan di options), sehingga peringatan di log hilang. Mekanismenya: migrasi dijalankan berurutan untuk setiap versi di antara versi tersimpan dan terpasang, terhadap tokens, options, dan layouts, sebelum validasi. Wajib untuk mayor, boleh untuk minor. Versi tersimpan lebih baru dari yang terpasang → default + dicatat. Baris database tidak ditulis ulang; config ditulis saat disimpan dari admin (M4). *Alternatif:* contoh identitas seperti guide, yang hanya menguji jalurnya.
- **[E] Test pembukti.** Smoke dan gate paralel: kuliner `tpl-news` beserta marker news. Snapshot view model home dengan section untuk dua site. Test render SSR view home dengan section. Test template-kit: section tak dikenal, props salah, layout kosong, rantai migrasi, versi lebih baru. Test arsitektur: entry `./manifest` tidak meng-import `.vue`/`.css`.
- **[F] Cek browser masuk repo.** Skrip cek hidrasi dan screenshot (Playwright, hanya lokal, tidak di CI) di `apps/web/scripts/`. *Alasan:* M2 mengeceknya dari folder sementara, padahal M3 menambah komponen baru (tanggal di section) yang rawan mismatch hidrasi.

## Keputusan

| Usulan | Disetujui? | Catatan |
|---|---|---|
| A — ADR-008 kontrak section | | |
| B — Manifest server tanpa Vue/CSS | | |
| C — Aturan layout tahan data buruk | | |
| D — migrateConfig magazine 1.1.0 | | |
| E — Test pembukti | | |
| F — Skrip cek browser di repo | | |
