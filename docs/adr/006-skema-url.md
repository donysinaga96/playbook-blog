# ADR-006: Skema URL publik

- Status: Diterima
- Tanggal: 2026-11-19

## Konteks

URL publik tersimpan di mesin pencari, media sosial, dan tautan situs lain. Mengubahnya setelah
site live berarti menulis redirect untuk setiap URL lama. Pola URL artikel sudah bisa diatur per
site lewat `sites.settings.permalink` (token `:category`, `:year`, `:month`, `:slug`), jadi URL
jenis halaman lain tidak boleh bentrok dengan permalink apa pun yang sah.

## Keputusan

| Halaman | URL | Catatan |
| --- | --- | --- |
| Home | `/` | |
| Artikel | `settings.permalink`, default `/:category/:slug` | `:category` = slug kategori artikel itu sendiri (bisa subkategori); `:year`/`:month` dari `published_at` di zona waktu site |
| Kategori | `/category/{slug}` | Termasuk artikel di subkategorinya |
| Tag | `/tag/{slug}` | |
| Penulis | `/author/{slug}` | |
| Halaman statis | `/p/{slug}` | `view_key` memilih varian tampilan |
| Pencarian | `/search?q=...` | |
| Pagination | `?page=N` pada URL listing | Halaman 1 tanpa parameter; `page` tidak valid = 404 |
| Feed (M2 2.4) | `/sitemap.xml`, `/robots.txt`, `/rss.xml` | |

Aturan pencocokan, berurutan:

1. Prefix tetap (`/category/`, `/tag/`, `/author/`, `/p/`, `/search`) dan home dicocokkan lebih
   dulu.
2. Sisanya dicocokkan ke pola permalink site. Artikel yang ditemukan dengan path yang berbeda
   dari URL kanoniknya (mis. kategori sudah dipindah) dialihkan 301 ke URL kanonik.
3. Tidak cocok atau konten tidak ada: cari di tabel `redirects`, lalu 404.

Path dinormalisasi sebelum dicocokkan: slash di ujung dibuang (`/category/gadget/` →
301 ke `/category/gadget`), huruf besar tidak diubah (slug selalu huruf kecil, jadi path huruf
besar berakhir 404 atau redirect dari tabel).

Prefix memakai bahasa Inggris (dipilih pemilik proyek) dan sama untuk semua site.

## Alternatif yang ditolak

- **Prefix berbahasa Indonesia** (`/kategori`, `/penulis`, `/cari`). Ditolak pemilik proyek;
  prefix bahasa Inggris lebih umum di CMS.
- **Halaman statis di `/{slug}`.** Bentrok dengan permalink satu segmen (`/:slug`) dan butuh
  daftar slug terlarang yang terus bertambah.
- **Pagination `/page/N`.** Butuh route tambahan per listing dan bentrok dengan permalink
  `/:category/:slug` bila ada kategori bernama `page`.
- **Prefix per site** (bisa diatur di settings). Belum ada kebutuhan; bisa ditambah nanti tanpa
  mengubah URL lama karena default-nya tetap sama.

## Konsekuensi

- Slug kategori dan halaman tidak boleh memakai kata yang dipakai prefix atau route sistem bila
  permalink membuatnya bentrok: `category`, `tag`, `author`, `p`, `search`, `api`, `media`,
  `_nuxt`, `__nuxt`. Daftarnya ada di `RESERVED_SEGMENTS` (`packages/core`) dan wajib dicek saat
  admin menyimpan slug (M4).
- Hanya `packages/core` yang tahu pola URL (`createUrlBuilder`). Template menerima `href` jadi
  dari view model.
- Mengubah `settings.permalink` site yang sudah live mengubah URL semua artikelnya. Admin (M4)
  wajib membuat redirect untuk URL lama saat permalink diganti.
