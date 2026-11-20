# Sumber tutorial

`docs/tutorial.md` adalah file hasil; **jangan diedit langsung**. Yang diedit:

- `tutorial.tpl.md`: teks semua bab. Kode tidak ditulis di sini, tetapi dirujuk dengan penanda
  satu baris `@@include path/dari/root/repo bahasa@@`, misalnya
  `@@include apps/web/nuxt.config.ts ts@@`.
- `build.mjs`: mengganti setiap penanda dengan isi file terbaru dari repo.

Perintah:

| Perintah | Fungsi |
| --- | --- |
| `pnpm tutorial` | Tulis ulang `docs/tutorial.md` dari template dan kode terbaru |
| `pnpm tutorial --check` | Gagal bila `docs/tutorial.md` belum diperbarui |

Aturan isi: tanpa header atau daftar isi, judul bab berupa topik (bukan nama milestone), langkah
bernomor yang detail, database hanya DDL (tanpa isi seed).
