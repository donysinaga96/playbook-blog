# Kerangka agent minimal

Contoh AI agent konten yang mengikuti [docs/kontrak-agent.md](../../docs/kontrak-agent.md). Agent menulis dengan Claude API: riset sumber di web, tulis artikel berbahasa Indonesia, tinjau sendiri, lalu kirim ke Antrian terbit. Mode `--sample` menulis artikel percobaan tanpa LLM, untuk menguji alur tanpa API key. Folder ini bukan bagian workspace pnpm: salin ke repo agent Anda sendiri bila mau dikembangkan (ADR-010: agent dibangun di luar repo ini).

| File | Isi |
|---|---|
| `src/agent.ts` | Alur utama: koneksi → konteks site → buat artikel → simpan gambar → INSERT |
| `src/db.ts` | Query sebagai `blog_agent`: site, kategori/penulis aktif, tag, alasan penolakan; upsert `generated_articles` |
| `src/storage.ts` | Simpan gambar ke folder (= `MEDIA_DIR` aplikasi). Ganti di sini saat pindah ke object storage |
| `src/generate.ts` | Claude API: web search + web fetch, tool `submit_article` (skema Zod = payload v1), fallback bila model menolak |
| `src/sample.ts` | Artikel contoh tanpa LLM (`--sample`), lengkap dengan gambar sampul |
| `src/article.ts` | Tipe hasil yang dikembalikan kedua pembuat konten |
| `src/placeholder-png.ts` | PNG polos untuk sampul bila tidak ada gambar |

## Menjalankan di lokal

1. Di repo utama, isi `AGENT_DB_PASSWORD` di `.env`, lalu terapkan role tanpa mengulang seed:

   ```bash
   SEED_DEV_DATA=false pnpm db:migrate
   ```

2. Di folder ini:

   ```bash
   cp .env.example .env      # isi password agent dan AGENT_MEDIA_DIR (= MEDIA_DIR aplikasi)
   pnpm install --ignore-workspace
   pnpm sample               # artikel contoh tanpa LLM -> antrian
   pnpm run dry-run          # Claude menulis (berbayar), payload hanya dicetak
   pnpm start                # Claude menulis -> antrian
   ```

   `pnpm start` dan `dry-run` butuh `ANTHROPIC_API_KEY`. Satu run biasanya beberapa menit. `AGENT_TOPIC` memberi arahan topik; tanpa itu model memilih topik sendiri dan menghindari judul yang sudah pernah dibuat.

3. Buka `http://admin.localhost:3000/admin`, masuk ke site tujuan, lalu buka **Antrian terbit**. Tulis alasan yang jelas saat menolak: pada run berikutnya alasan itu tercetak di awal output dan ikut dikirim ke Claude sebagai bahan perbaikan.

Menjalankan ulang dengan `AGENT_RUN_ID` dan slug yang sama memperbarui baris yang masih menunggu, tidak membuat baris baru. Baris yang sudah diputuskan admin tidak berubah.

## Agent di PC, aplikasi di VPS

- **Database.** Postgres di VPS hanya terbuka di `127.0.0.1`. Buka tunnel `ssh -N -L 5433:localhost:5432 user@vps`, lalu arahkan `AGENT_DATABASE_URL` ke port 5433.
- **Gambar.** File harus sudah ada di `MEDIA_DIR` VPS sebelum admin meng-approve. Pilihannya: simpan ke folder lokal lalu `rsync` ke VPS sebelum INSERT, atau buat implementasi `ImageStorage` untuk object storage setelah providernya dipilih.
- **Jadwal subuh.** Cron di PC hanya jalan bila PC menyala. Untuk jadwal yang andal, jalankan agent di VPS (cron atau systemd timer). Agent di VPS cukup konek ke `localhost`.

## Biaya Claude API

- Agent memakai **Claude API**, yang ditagih per token di akun [Claude Console](https://platform.claude.com) (isi saldo atau tagihan bulanan). Langganan claude.ai Pro/Max **tidak** mencakup pemakaian API, dan API key tidak bisa dibuat dari langganan itu.
- Biaya per run tergantung panjang riset: token yang dibaca dari halaman web ikut dihitung sebagai input, dan web search punya biaya per pencarian. Cek angka sebenarnya di halaman Usage di Console setelah beberapa run, lalu pasang batas pengeluaran (spend limit) di sana.
- Penghematan yang bisa diatur dari env: `AGENT_MODEL` (model lebih murah, mis. `claude-sonnet-5-5`), dan `max_uses` web search/fetch serta `effort` di `src/generate.ts`. Ukur mutu artikelnya dulu sebelum menurunkan.

## Batasan saat ini

- Mode Claude belum membuat gambar. Artikel terbit tanpa sampul sampai sumber gambar diputuskan (stok foto berlisensi, gambar resmi dengan kredit, atau model gambar).
- Video tidak ditulis sebagai block `embed`. Video yang dipakai cukup masuk `references` dengan `kind: VIDEO`. Embed butuh URL yang dikenali provider, jadi ditunda agar approval tidak gagal.
- Slug dari model bisa bentrok dengan artikel yang sudah terbit. Agent tidak boleh membaca tabel `articles`, jadi bentrokan baru ketahuan sebagai galat saat approval.

Pemeriksaan lengkap dijalankan saat approval, jadi payload yang salah tetap masuk antrian dan galatnya tampil di admin.
