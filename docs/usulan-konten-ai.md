# Usulan M5a — Alur konten AI dan approval

Status: semua usulan disetujui 22 Nov 2026 (K2 tidak dipakai). Rincian task ada di [TASKS.md](../TASKS.md#m5a--alur-konten-ai-dan-approval).

## Tujuan (dari pemilik proyek, 22 Nov 2026)

- Konten dibuat oleh AI agent milik pemilik proyek. Agent dibangun **di luar repo ini** dan berjalan saat subuh atau saat dipicu manual.
- Agent menulis hasilnya ke **tabel tersendiri untuk hasil AI**, bukan ke tabel konten (`articles`). Status di tabel konten **tidak berubah** (`DRAFT`, `REVIEW`, `PUBLISHED`, `ARCHIVED`).
- `READY_TO_PUBLISH` adalah status hasil AI yang tampil di antrian approval admin.
- **Approve** memindahkan hasil AI ke tabel konten yang sebenarnya, sehingga konten bisa diakses dari web. **Tolak** mengarsipkan hasil AI beserta alasannya.
- Approval juga memeriksa apakah hasil AI sesuai aturan kode. Hasil yang salah tidak bisa dipindahkan dan bisa ditolak.
- Konten berisi teks dan gambar. Gambar diambil dari object storage (provider belum dipilih). Video ditampilkan dari alamat aslinya dan tidak disimpan.
- Semua referensi yang dipakai AI disimpan dan **ditampilkan di halaman konten**. Isi yang diambil dari sumber lain selalu menyebut asalnya.

## Alur

```
AI agent (di luar repo)
   │  INSERT/UPDATE sebagai role blog_agent
   ▼
generated_articles  (status READY_TO_PUBLISH, payload JSON berversi)
   │  admin: Antrian terbit → pratinjau + pemeriksaan
   ├── Tolak ──────────► generated_articles.status = ARCHIVED + alasan
   └── Approve ────────► satu transaksi:
                          media (gambar dari object storage)
                          articles (PUBLISHED, published_at sekarang/terjadwal)
                          article_tags, article_references
                          generated_articles.status = APPROVED + article_id
```

## Usulan

- **[K1] Tabel `generated_articles` untuk hasil AI.** Kolom:
  - `site_id`, `external_id` (unik per site, agar run subuh dan trigger manual tidak dobel), `status`, `payload` (JSONB berversi), `generated_at`
  - `review_note`, `reviewed_by`, `reviewed_at`, `article_id` (artikel hasil approve)

  Status: `READY_TO_PUBLISH` → `APPROVED` atau `ARCHIVED`. `payload` memuat judul, slug, ringkasan, slug kategori, tag, penulis, body block v1, gambar (`storage_key`, alt, kredit, `source_url`), referensi, dan SEO. *Alasan:* tabel konten dan statusnya tidak tersentuh sampai pemilik proyek menyetujui. Agent juga tidak perlu tahu ID internal (kategori, tag, dan media dirujuk lewat slug dan `storage_key`).
- **[K3] Antrian approval di admin, dengan pemeriksaan.** Halaman antrian menampilkan hasil AI `READY_TO_PUBLISH` dari semua site milik user. Halaman detailnya berisi pratinjau dengan template site, daftar pemeriksaan, dan daftar referensi. Ada empat aksi:
  - **Terbitkan sekarang** atau **Jadwalkan**. Keduanya diblokir bila ada galat.
  - **Tolak**. Alasan wajib diisi.
  - **Pindahkan sebagai draft**. Hasil AI masuk ke `articles` sebagai `DRAFT` untuk diedit di editor yang sudah ada.

  Galat memblokir; peringatan hanya ditampilkan.
- **[K4] Approve dalam satu transaksi di core.** Langkahnya: kunci baris hasil AI (`FOR UPDATE`), periksa ulang, buat media, artikel, tag, dan referensi, lalu tandai `APPROVED` dan simpan `article_id`. Klik ganda atau dua admin bersamaan tidak membuat dua artikel. Snapshot revisi pertama artikel mencatat asal hasil AI.
- **[K5] Gate M5a di CI.** Skrip meniru agent dengan INSERT sebagai `blog_agent`. Lalu diperiksa:
  - Tidak ada apa pun yang tampil di web.
  - Agent tidak bisa menulis ke `articles`.
  - Hasil yang rusak tidak bisa di-approve.
  - Tolak mengubah status menjadi `ARCHIVED`.
  - Approve membuat konten tampil beserta referensinya.
- **[K6] Referensi tersimpan dan tampil.** Tabel `article_references` berisi urutan, judul, URL, penerbit, dan jenis, dengan composite FK. `media` mendapat kolom `source_url`. Halaman artikel menampilkan bagian "Sumber dan referensi" dari komponen base, sehingga semua template memakainya tanpa override. Kredit dan sumber tampil di bawah gambar. Embed video diberi tautan ke alamat aslinya. JSON-LD artikel diberi `citation`. Artikel yang ditulis manual di admin juga bisa punya referensi.
- **[K7] Role database `blog_agent` + dokumen kontrak.** Role ini hanya boleh INSERT/UPDATE `generated_articles`, ditambah SELECT pada sites, categories, tags, dan authors untuk mengetahui pilihan yang valid. Trigger menolak bila agent menulis status selain `READY_TO_PUBLISH` atau mengubah hasil yang sudah diputuskan. `docs/kontrak-agent.md` menjelaskan skema payload, contoh SQL, dan aturan pemeriksaan. *Alasan:* agent menulis langsung ke database. Dengan role ini, kesalahan agent tidak bisa sampai ke tabel konten atau ke web.

## Pemeriksaan saat approve (K3)

| Pemeriksaan | Jenis |
|---|---|
| Payload lolos skema versi yang dikenal; body lolos skema block v1 tanpa block yang dibuang | Galat |
| Kategori dan penulis ada di site itu dan aktif | Galat |
| Tag belum ada di site | Peringatan (dibuat saat approve) |
| Gambar: file `storage_key` ada di storage; tipe gambar dikenali | Galat |
| URL embed dikenali provider (YouTube, Vimeo, X) | Galat |
| Slug valid dan belum dipakai artikel site itu (redirect lama dengan path yang sama tidak masalah: konten menang atas redirect) | Galat |
| Judul ada; panjang judul SEO dan deskripsi dalam batas | Galat / peringatan |
| URL referensi http(s) dan judulnya terisi | Galat |
| Tidak ada referensi sama sekali | Peringatan |
| Gambar tanpa kredit atau `source_url` | Peringatan |
| URL embed tidak tercantum di referensi | Peringatan (tetap tampil sebagai sumber video) |

## Ditunda (bukan alur approval)

- Adapter object storage. Menunggu provider dipilih; hampir semua kandidat S3-compatible, jadi satu adapter S3 bisa diuji lokal dengan MinIO. Sampai provider dipilih, gambar diuji dengan storage lokal (`MEDIA_DIR`) yang memakai skema `storage_key` yang sama.
- Provider video tambahan selain YouTube, Vimeo, dan X.
- Tombol "generate sekarang" di admin. Pemicu manual ada di sisi agent.

## Keputusan

| Usulan | Disetujui? | Catatan |
|---|---|---|
| Status `articles` tetap | Ya, 22 Nov 2026 | `READY_TO_PUBLISH` hanya status hasil AI di antrian |
| K1 — Tabel `generated_articles` | Ya, 22 Nov 2026 | |
| K2 — API ingest | Tidak | Agent menulis langsung ke database |
| K3 — Antrian approval + pemeriksaan | Ya, 22 Nov 2026 | Approve memindahkan ke tabel konten |
| K4 — Approve satu transaksi | Ya, 22 Nov 2026 | |
| K5 — Gate M5a di CI | Ya, 22 Nov 2026 | |
| K6 — Referensi tersimpan dan tampil | Ya, 22 Nov 2026 | Wajib tampil di halaman konten (hak cipta sumber) |
| K7 — Role `blog_agent` + kontrak | Ya, 22 Nov 2026 | |
| Tolak = arsip | Ya, 22 Nov 2026 | `ARCHIVED` + alasan, di tabel hasil AI |
| Tag baru dibuat saat approve; kategori belum ada = galat | Ya, 22 Nov 2026 | |
