# Kontrak AI agent

Dokumen ini untuk pembuat AI agent konten (di luar repo ini). Isinya: apa yang boleh dibaca dan ditulis agent di database, bentuk data yang ditulis, dan apa yang terjadi setelahnya. Latar keputusannya ada di [ADR-010](adr/010-alur-konten-ai.md).

Sumber kebenaran bentuk payload adalah skema Zod `generatedPayloadSchema` di [packages/core/src/generated/payload.ts](../packages/core/src/generated/payload.ts). Contoh payload di dokumen ini diuji otomatis terhadap skema itu (`payload.test.ts`). Kalau test itu gagal, dokumen ini sudah tidak sesuai dengan kode.

> Tabel dibuat oleh [migration 0002](../packages/db/migrations/0002_konten_ai.sql); hak role diatur oleh [agent_role.sql](../packages/db/scripts/agent_role.sql) dan diuji di `packages/db/run_all.sh` (bagian 7).

## Alur

1. Agent menyimpan gambar ke object storage dengan key yang diawali kode site, misalnya `dapur-nusantara/2026/11/saksang.webp`.
2. Agent menulis satu baris per artikel ke `generated_articles`. Statusnya otomatis `READY_TO_PUBLISH`.
3. Hasil AI **tidak pernah tampil di web** selama masih di tabel ini.
4. Pemilik proyek membuka **Antrian terbit** di admin. Layar itu menampilkan pratinjau dengan template site, hasil pemeriksaan, dan daftar referensi. Lalu pemilik proyek memilih satu aksi:
   - **Terbitkan sekarang** atau **Jadwalkan**. Isi payload dipindah ke tabel konten, status hasil AI menjadi `APPROVED`, dan `article_id` terisi.
   - **Pindahkan sebagai draft**. Isi dipindah sebagai artikel `DRAFT` untuk diedit dulu. Status hasil AI menjadi `APPROVED`.
   - **Tolak**. Status hasil AI menjadi `ARCHIVED`, dan alasannya tersimpan di `review_note`.
5. Setelah diputuskan, baris itu tidak bisa diubah agent lagi. Agent bisa membaca `status` dan `review_note` untuk belajar dari penolakan.

## Koneksi

Agent login ke PostgreSQL sebagai role `blog_agent`. Username dan password diatur lewat env `AGENT_DB_USER` dan `AGENT_DB_PASSWORD` saat role dibuat (`packages/db/scripts/agent_role.sh`, dijalankan otomatis oleh `pnpm db:migrate`). Bila `AGENT_DB_PASSWORD` kosong, role dibuat `NOLOGIN`: haknya terpasang, tetapi agent belum bisa login.

| Tabel | Hak `blog_agent` |
|---|---|
| `sites` | SELECT: `id`, `code`, `name`, `status` |
| `categories` | SELECT: kategori yang bisa dipakai (`slug`, `name`, `status`, `parent_id`) |
| `authors` | SELECT: penulis (`slug`, `name`, `status`) |
| `tags` | SELECT: tag yang sudah ada (`slug`, `name`) |
| `generated_articles` | SELECT semua kolom; INSERT hanya `site_id`, `external_id`, `payload`, `agent_note`, `generated_at`; UPDATE hanya `payload`, `agent_note`, `generated_at`. Tanpa DELETE |
| Tabel lain (termasuk `articles`, `media`, `users`) | Tidak ada akses |

Karena kolom `status` dan kolom keputusan tidak bisa diisi agent, setiap baris yang ditulis agent pasti `READY_TO_PUBLISH`. Kolom yang dipilih dengan `SELECT` harus kolom yang diizinkan: `SELECT * FROM sites` ditolak, `SELECT id, code FROM sites` diterima.

Hanya kategori dan penulis dengan `status = 'ACTIVE'` yang lolos pemeriksaan approval.

## Tabel `generated_articles`

| Kolom | Diisi oleh | Keterangan |
|---|---|---|
| `id` | database | UUIDv7 |
| `site_id` | agent | ID site tujuan (cari lewat `sites.code`) |
| `external_id` | agent | ID buatan agent, unik per site, maks 200 karakter. Menulis ulang dengan `external_id` yang sama memperbarui baris yang masih `READY_TO_PUBLISH`, tidak membuat baris baru |
| `payload` | agent | JSON hasil AI (lihat di bawah) |
| `agent_note` | agent | Opsional. Ringkasan tinjauan AI (sumber yang dicek, keraguan), tampil di layar approval |
| `generated_at` | agent | Waktu hasil dibuat; bawaan `now()` |
| `status` | aplikasi | `READY_TO_PUBLISH` → `APPROVED` / `ARCHIVED` |
| `review_note`, `reviewed_by`, `reviewed_at` | aplikasi | Keputusan pemilik proyek; `review_note` wajib bila ditolak |
| `article_id` | aplikasi | Artikel hasil approve |

### Menulis satu hasil

```sql
INSERT INTO generated_articles (site_id, external_id, payload, agent_note)
VALUES (
  (SELECT id FROM sites WHERE code = 'dapur-nusantara'),
  'run-2026-11-23-subuh/saksang',
  $payload$ { ...payload JSON... } $payload$::jsonb,
  'Tiga sumber dicek; takaran bumbu dari sumber 1.'
)
ON CONFLICT (site_id, external_id) DO UPDATE
  SET payload = EXCLUDED.payload,
      agent_note = EXCLUDED.agent_note,
      generated_at = now()
  WHERE generated_articles.status = 'READY_TO_PUBLISH';
```

Kalau baris dengan `external_id` itu sudah diputuskan, `UPDATE` tidak mengubah apa pun (0 baris). Tanpa klausa `WHERE` itu, database menolak dengan galat "sudah diputuskan" (trigger `generated_articles_guard`). Pakai `external_id` baru untuk hasil baru.

## Payload v1

| Field | Wajib | Keterangan |
|---|---|---|
| `version` | ya | `1` |
| `title` | ya | 1–300 karakter |
| `slug` | tidak | Huruf kecil, angka, tanda hubung. Tidak diisi = dibuat dari judul saat approve. Slug yang sudah dipakai artikel atau redirect site itu = galat |
| `excerpt` | tidak | Ringkasan, maks 1.000 karakter |
| `category` | ya | Slug kategori yang **sudah ada** di site. Kategori tidak dibuat otomatis |
| `author` | tidak | Slug penulis di site; tidak diisi = tanpa byline |
| `tags` | tidak | Nama tag, maks 50. Tag yang belum ada dibuat saat approve (dengan peringatan). Dua nama dengan slug yang sama dianggap dobel |
| `format` | tidak | `STANDARD` (bawaan), `LISTICLE`, `GALLERY`, `VIDEO` |
| `cover` | tidak | `key` gambar sampul dari `images` |
| `images` | tidak | Daftar gambar (lihat di bawah), maks 100 |
| `body` | ya | `{ "version": 1, "blocks": [...] }`, minimal satu block |
| `references` | tidak | Daftar sumber (lihat di bawah), maks 100. Kosong = peringatan di approval |
| `seo` | tidak | `{ "title": maks 200, "description": maks 320 }` |

Field yang tidak dikenal ditolak, termasuk `status` dan `published_at`. Keduanya keputusan pemilik proyek.

### Block body

Sama dengan block body v1 artikel, kecuali gambar:

| Block | Bentuk |
|---|---|
| Paragraf | `{ "type": "paragraph", "text": "..." }`. Teks polos, bukan HTML |
| Judul bagian | `{ "type": "heading", "level": 2, "text": "..." }`. Level 2–4 (level 1 = judul artikel) |
| Gambar | `{ "type": "image", "image": "<key>", "caption": "..." }`. `image` menunjuk `images[].key` |
| Kutipan | `{ "type": "quote", "text": "...", "cite": "..." }` |
| Daftar | `{ "type": "list", "style": "bullet" atau "numbered", "items": ["..."] }` |
| Video/embed | `{ "type": "embed", "provider": "youtube" atau "vimeo" atau "x", "url": "https://..." }` |

Video tidak disimpan. Block `embed` memutar video dari alamat aslinya dan menampilkan tautan ke sumbernya. Provider lain belum didukung, jadi tulis video seperti itu sebagai referensi saja.

### Gambar

| Field | Wajib | Keterangan |
|---|---|---|
| `key` | ya | Nama lokal di payload ini, misalnya `cover`, `img-2` (huruf kecil, angka, `_`, `-`) |
| `storageKey` | ya | Lokasi file di object storage, diawali kode site. File harus sudah ada saat approval |
| `altText` | ya | Deskripsi gambar untuk pembaca layar |
| `caption` | tidak | Keterangan di bawah gambar |
| `credit` | tidak | Pemilik hak, misalnya "Foto: Kantor Berita X" |
| `sourceUrl` | tidak | Halaman asal gambar bila diambil dari sumber lain |
| `focalX`, `focalY` | tidak | Titik fokus 0–1 untuk pemotongan; bawaan 0,5 |

Gambar yang diambil dari sumber lain **harus** punya `credit` atau `sourceUrl`. Gambar tanpa keduanya diberi peringatan saat approval.

### Referensi

| Field | Wajib | Keterangan |
|---|---|---|
| `title` | ya | Judul sumber |
| `url` | ya | `http://` atau `https://` |
| `publisher` | tidak | Nama media atau situs |
| `kind` | tidak | `ARTICLE` (bawaan), `VIDEO`, `IMAGE`, `OTHER` |

Semua sumber yang dipakai AI untuk menulis isi dicantumkan di sini. Semuanya tampil di bagian "Sumber dan referensi" di akhir artikel, dengan urutan sesuai daftar.

### Contoh lengkap

<!-- contoh-payload -->
```json
{
  "version": 1,
  "title": "Saksang, Masakan Pesta dari Tanah Batak",
  "excerpt": "Sejarah singkat saksang dan bumbu andaliman yang membuatnya khas.",
  "category": "resep",
  "tags": ["Masakan Batak", "Andaliman"],
  "cover": "cover",
  "images": [
    {
      "key": "cover",
      "storageKey": "dapur-nusantara/2026/11/saksang-cover.webp",
      "altText": "Saksang dalam mangkuk tanah liat",
      "credit": "Foto: Arsip Contoh",
      "sourceUrl": "https://contoh.test/galeri/saksang"
    }
  ],
  "body": {
    "version": 1,
    "blocks": [
      { "type": "paragraph", "text": "Saksang biasa hadir di pesta adat Batak." },
      { "type": "heading", "level": 2, "text": "Bumbu utama" },
      { "type": "list", "style": "bullet", "items": ["Andaliman", "Bawang batak", "Lengkuas"] },
      { "type": "image", "image": "cover", "caption": "Saksang siap disajikan" },
      { "type": "embed", "provider": "youtube", "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }
    ]
  },
  "references": [
    { "title": "Mengenal andaliman", "url": "https://contoh.test/andaliman", "publisher": "Contoh Kuliner" },
    { "title": "Video memasak saksang", "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "publisher": "YouTube", "kind": "VIDEO" }
  ],
  "seo": { "description": "Sejarah saksang dan bumbu andaliman khas Batak." }
}
```

## Pemeriksaan saat approval

Galat memblokir approve. Peringatan hanya ditampilkan, dan pemilik proyek yang memutuskan.

| Pemeriksaan | Jenis |
|---|---|
| Payload lolos skema versi yang dikenal (bentuk, panjang, field tak dikenal, key gambar) | Galat |
| Kategori dan penulis ada di site itu dan `ACTIVE` | Galat |
| Tag belum ada di site | Peringatan (dibuat saat approve) |
| `storageKey` diawali kode site, file ada di storage, dan tipenya gambar yang dikenali | Galat |
| URL embed dikenali provider | Galat |
| Slug valid dan belum dipakai artikel atau redirect site itu | Galat |
| Tidak ada referensi sama sekali | Peringatan |
| Gambar tanpa `credit` dan `sourceUrl` | Peringatan |
| URL embed tidak ada di `references` | Peringatan (video tetap diberi tautan ke sumbernya) |

## Versi payload

Perubahan bentuk payload menaikkan `version`. Aplikasi tetap membaca versi lama selama masih ada hasil AI versi itu di antrian. Agent sebaiknya selalu menulis versi terbaru yang tercantum di dokumen ini.
