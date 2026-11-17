# ADR-001: Satu schema, dua mode deploy

- Status: Diterima
- Tanggal: 2026-11-17

## Konteks

Framework ini harus bisa menjadi beberapa produk blog dengan tampilan berbeda. Sebagian site
dijalankan sendiri sebagai jaringan site milik pribadi; sebagian lain mungkin diserahkan atau
dijual terpisah dan butuh isolasi penuh. Keputusan ini memengaruhi schema database, cara site
dipilih pada setiap request, dan template mana yang di-bundle.

## Keputusan

Satu codebase dan satu schema dijalankan dalam dua mode. Mode dipilih lewat konfigurasi saat
deploy, bukan lewat schema.

| Mode | Cara site dipilih | Database | Template di-bundle |
| --- | --- | --- | --- |
| Single-site | env `SITE_CODE`; domain tetap dicek | Database sendiri per produk | Hanya yang dipakai (env `TEMPLATES`) |
| Multi-site | Host request → `site_domains` | Satu database bersama | Semua template terdaftar |

Setiap tabel milik site punya `site_id NOT NULL`, dan relasi antar tabel milik site memakai
composite FK `(site_id, x_id) → (site_id, id)`, di kedua mode.

## Alternatif yang ditolak

- **Schema per site (PostgreSQL schema terpisah).** Migration harus dijalankan N kali dan
  query lintas site untuk superadmin jadi rumit.
- **Database per site saja.** Biaya server naik untuk jaringan site milik sendiri.
- **Multi-site saja.** Tidak memberi isolasi penuh untuk produk yang diserahkan ke pihak lain.

## Konsekuensi

- Primary key memakai UUIDv7, jadi satu site bisa dipindah antar database dengan menyalin baris
  ber-`site_id` yang sama tanpa bentrok ID.
- Kode tidak boleh mengandalkan "hanya ada satu site" walau berjalan di mode single-site:
  repository tetap wajib menerima `siteId`.
- Tidak boleh ada global state di SSR; cache key selalu memuat site.
