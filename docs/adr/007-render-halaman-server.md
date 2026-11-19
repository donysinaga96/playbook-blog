# ADR-007: Halaman publik dirender penuh di server

- Status: Diterima
- Tanggal: 2026-11-19

## Konteks

Halaman publik butuh data dari database (view model) sebelum dirender. Nuxt biasanya mengambil
data lewat `useFetch` ke server API, lalu menavigasi di browser tanpa memuat ulang halaman. Dua
hal membuat pola itu kurang cocok di sini:

- Entry `@framework/core` membawa `@framework/db` dan driver `pg`. Driver ini rusak bila ikut
  di-bundle ke bundle SSR Vue (terbukti di M2 2.2), jadi kode Vue tidak boleh memanggil core.
- Site berita dibaca per artikel dari mesin pencari dan media sosial. Navigasi di browser hanya
  menambah JavaScript dan kerumitan (cache view model per site di klien) tanpa banyak manfaat.

## Keputusan

1. Setiap halaman publik dirender penuh di server. Tautan di template adalah `<a href>` biasa;
   tidak ada navigasi sisi klien.
2. View model dibangun di sisi Nitro (`apps/web/server/`), dalam middleware yang sama dengan
   resolver site: site → route → view model → `event.context.page`.
3. Aplikasi Vue hanya menyalin `event.context.page` ke `useState` (plugin `.server.ts`) lalu
   merender view template. Kode di `apps/web/app/` tidak pernah memanggil repository.
4. Status HTTP (404) dan redirect (301 permalink, tabel `redirects`) diputuskan di middleware,
   sebelum Vue dirender.

## Alternatif yang ditolak

- **`useFetch` ke server API + navigasi sisi klien.** Lebih banyak JavaScript, butuh endpoint
  view model per jenis halaman, dan header `Host` harus diteruskan dengan benar pada fetch internal
  agar site tidak tertukar.
- **Membangun view model di plugin Vue `.server.ts` lewat core.** Membawa `pg` ke bundle SSR Vue.

## Konsekuensi

- Halaman ringan: JavaScript di browser hanya untuk hidrasi Vue. Bila nanti butuh interaksi
  (mis. form komentar), tambahkan komponen kecil, bukan navigasi klien.
- Cache halaman (M5) cukup di level HTTP per URL + Host.
- Bila navigasi sisi klien dibutuhkan kelak, view model yang sama bisa dibuka lewat server API
  tanpa mengubah template; keputusan ini cukup direvisi dengan ADR baru.
