# ADR-010: Alur konten AI: tabel hasil AI terpisah, approval memindahkan ke tabel konten

- Status: Diterima
- Tanggal: 2026-11-22

## Konteks

Pemilik proyek memperjelas tujuan produk (22 Nov 2026): konten site dibuat oleh AI agent yang
dibangun **di luar repo ini**. Agent berjalan saat subuh atau saat dipicu manual, meninjau
hasilnya sendiri, lalu menyimpannya ke database. Pagi harinya pemilik proyek memutuskan konten
mana yang terbit. Konten yang diambil dari sumber lain wajib menyebut sumbernya di halaman.

Guide awal menunda AI ke backlog setelah M5 dan berencana memakai status artikel `REVIEW` untuk
hasil AI. Yang harus diputuskan sekarang:

- Di mana hasil AI disimpan sebelum disetujui, dan apakah status `articles` berubah.
- Bagaimana agent menulis: lewat API aplikasi atau langsung ke database.
- Bagaimana mencegah hasil AI tampil di web tanpa persetujuan, juga saat agent salah.
- Bagaimana referensi disimpan dan ditampilkan.

## Keputusan

1. **Tabel hasil AI terpisah: `generated_articles`.** Status `articles` tidak berubah
   (`DRAFT`, `REVIEW`, `PUBLISHED`, `ARCHIVED`). Hasil AI punya status sendiri:
   `READY_TO_PUBLISH` → `APPROVED` (sudah dipindah ke tabel konten) atau `ARCHIVED` (ditolak,
   dengan alasan). Hasil AI tidak pernah dibaca oleh halaman publik.
2. **Agent menulis langsung ke database** sebagai role `blog_agent`, tanpa API ingest. Role ini
   hanya boleh menulis `generated_articles` (kolom isi saja; status dan kolom keputusan tidak) dan
   membaca sites, categories, tags, authors. Hasil yang sudah diputuskan tidak bisa diubah lagi.
3. **Payload berversi dan tidak memakai ID internal.** Kolom `payload` (JSONB) mengikuti skema
   `generatedPayloadSchema` v1 di `packages/core/src/generated/payload.ts`. Kategori, penulis,
   dan tag dirujuk lewat slug atau nama; gambar lewat `key` lokal yang menunjuk `storageKey` di
   object storage. Status dan tanggal terbit tidak ada di payload. Kontrak untuk agent:
   [docs/kontrak-agent.md](../kontrak-agent.md).
4. **Pemeriksaan saat approval, bukan saat agent menulis.** Database hanya menjaga bentuk luar
   (payload berupa object). Layar approval menjalankan skema payload dan pemeriksaan yang butuh
   database atau storage (kategori ada, slug belum dipakai, file gambar ada). Galat memblokir
   approve; peringatan hanya ditampilkan.
5. **Approve = pindah dalam satu transaksi.** Baris hasil AI dikunci (`FOR UPDATE`), diperiksa
   ulang, lalu media, artikel (`PUBLISHED` sekarang atau terjadwal, atau `DRAFT` untuk diedit),
   tag baru, dan referensi dibuat; hasil AI ditandai `APPROVED` dengan `article_id`. Klik ganda
   atau dua admin bersamaan menghasilkan satu artikel. Tag yang belum ada dibuat; kategori yang
   belum ada adalah galat (kategori memengaruhi menu dan URL).
6. **Referensi adalah data artikel, bukan hanya data AI.** Tabel `article_references` (urutan,
   judul, URL, penerbit, jenis) dan kolom `media.source_url`. Halaman artikel menampilkan bagian
   "Sumber dan referensi" dari komponen base untuk semua template; kredit dan sumber gambar
   tampil di bawah gambar; embed video diberi tautan ke alamat aslinya. Artikel yang ditulis
   manual di admin juga bisa punya referensi.

## Alternatif yang ditolak

- **Hasil AI langsung di `articles` dengan status baru `READY_TO_PUBLISH`.** Satu tabel lebih
  sedikit, tetapi setiap query publik dan admin harus mengecualikan status itu, dan kesalahan
  satu filter langsung menampilkan konten yang belum disetujui. Ditolak pemilik proyek.
- **API ingest (`POST /api/ingest/...`) dengan token agent.** Validasi terjadi saat agent
  menulis, tetapi menambah permukaan HTTP baru yang terbuka ke internet dan mengikat agent ke
  aplikasi yang sedang berjalan. Dengan tabel terpisah dan role terbatas, kesalahan agent
  tidak bisa mencapai web, jadi validasi cukup dilakukan saat approval.
- **Queue (Redis/BullMQ) untuk hasil AI.** Tidak perlu: agent menulis kapan saja, pemilik
  proyek memutuskan kapan saja, dan jadwal terbit tetap memakai `published_at`.

## Konsekuensi

- Agent bisa dikembangkan terpisah, cukup mengikuti `docs/kontrak-agent.md`. Perubahan bentuk
  payload = naikkan `GENERATED_PAYLOAD_VERSION`; aplikasi harus tetap bisa membaca versi lama
  yang masih ada di antrian.
- Payload yang rusak tetap tersimpan sampai pemilik proyek menolaknya. Ini disengaja: alasan
  penolakan (`review_note`) bisa dibaca agent untuk memperbaiki hasil berikutnya.
- Gambar harus sudah ada di storage sebelum hasil AI disimpan. Sampai provider object storage
  dipilih, pengujian memakai storage lokal (`MEDIA_DIR`) dengan skema `storage_key` yang sama.
- Role database kedua (`blog_agent`) harus ikut dikelola: password di env, dibuat oleh skrip
  idempotent seperti `blog_app`, dan diuji hak aksesnya di `run_all.sh`.
- ADR infrastruktur produksi (M5, ditahan) bergeser menjadi ADR-011.
