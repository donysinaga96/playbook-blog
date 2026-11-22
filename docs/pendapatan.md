# Dashboard pendapatan multi-sumber

Panduan menjalankan, mengonfigurasi, dan memverifikasi dashboard pendapatan
(ADR-011). Tampilan awal setelah login superadmin di `/admin`; admin konten
dibuka dengan tombol **Admin Blog**.

## Peta fitur

| Menu | Isi |
|---|---|
| Dashboard (`/admin`) | Total periode + perubahan vs periode sebelumnya, komposisi per sumber, hari ini, bulan ini (vs bulan lalu di tanggal sama), angka sementara, rata-rata harian, tren per sumber (harian/mingguan/bulanan, grafik atau tabel), per situs, kesehatan konektor, aktivitas terbaru. Filter: rentang, sumber, status, situs |
| Sumber pemasukan | Satu halaman per sumber. Adsterra: impressions, clicks, CTR, eCPM, rincian domain/placement, riwayat tarik API. AdSense: page views, clicks, page RPM, status OAuth, riwayat sync. Lynk.id: order, rata-rata order, produk, URL + status webhook, event masuk. Sumber lain: riwayat impor |
| Situs | Dashboard yang sama difilter ke satu situs; Kelola situs (domain dipakai memetakan laporan) |
| Transaksi | Seluruh ledger, filter + pencarian, detail entri (kurs, metrik, revisi, payload), refund, input manual dan adjustment |
| Impor file | Wizard CSV/Excel/JSON: unggah, mapping kolom + pratinjau validasi, hasil inserted/updated/unchanged/skipped/failed |
| Koneksi & log | Pengaturan sumber (aktif, jadwal, jendela ulang, config non-rahasia), status env, uji koneksi, tarik manual, sumber baru, log tarik data |
| Kurs | Kurs ke mata uang utama, konversi entri yang belum berkurs, hitung ulang rentang |

## Menjalankan di dev

```bash
pnpm db:migrate          # menerapkan 0003_pendapatan.sql (8 tabel + 5 sumber bawaan)
pnpm db:pull             # hanya bila mengubah migration
pnpm revenue:demo        # data contoh 120 hari: Adsterra, AdSense, Lynk.id, Whop, manual
pnpm dev                 # buka http://admin.localhost:3000/admin (login superadmin)
pnpm revenue:demo --remove   # hapus semua data contoh
```

Data contoh masuk lewat jalur sungguhan: sync mock Adsterra/AdSense, webhook
Lynk.id bertanda tangan (termasuk satu kiriman ulang dan satu refund), impor
CSV Whop, dan input manual. Kurs USD->IDR contoh bukan kurs resmi.

Agar tombol "Tarik data" dan "Kirim event uji" berjalan tanpa kredensial,
isi `REVENUE_MOCK=true` di `.env` lalu **restart** `pnpm dev`.

## Environment variable

| Variabel | Arti |
|---|---|
| `REVENUE_BASE_CURRENCY` | Mata uang utama dashboard (bawaan `IDR`) |
| `REVENUE_TIMEZONE` | Zona waktu "hari ini" (bawaan `Asia/Jakarta`) |
| `REVENUE_MOCK` | `true`: adapter API/webhook memakai mock (dev/sandbox) |
| `REVENUE_MOCK_REVISION` | Angka >0 mensimulasikan revisi angka oleh jaringan iklan |
| `REVENUE_SCHEDULER` | `true`: proses web menarik sumber terjadwal (satu replika saja) |
| `REVENUE_HEADLESS_ENABLED` | `true`: izinkan sumber otomasi browser (juga butuh `config.enabled`) |
| `REVENUE_ADSTERRA_API_TOKEN` | API token Adsterra (Publisher > API) |
| `REVENUE_ADSENSE_CLIENT_ID` / `_CLIENT_SECRET` / `_REFRESH_TOKEN` | OAuth 2.0 AdSense, scope `adsense.readonly` |
| `REVENUE_LYNK_MERCHANT_KEY` | Merchant key Lynk.id (muncul setelah URL webhook disimpan) |

Awalan `REVENUE_ADSTERRA`, `REVENUE_ADSENSE`, `REVENUE_LYNK` adalah nilai
`credentials_env` sumber bawaan. Nilai rahasia tidak pernah disimpan di database.

## Memasang kredensial asli

**Adsterra.** Buat API token di dashboard publisher Adsterra, isi
`REVENUE_ADSTERRA_API_TOKEN`, restart, lalu Koneksi & log > Adsterra > Uji
koneksi (menampilkan daftar domain). Domain di laporan dipetakan ke situs
lewat Kelola situs.

**Google AdSense.**
1. Google Cloud Console: aktifkan AdSense Management API, buat OAuth client
   (Desktop app atau Web), catat client ID dan secret.
2. Dapatkan refresh token untuk scope `https://www.googleapis.com/auth/adsense.readonly`
   (mis. lewat OAuth 2.0 Playground dengan "Use your own OAuth credentials").
   Aplikasi OAuth berstatus "Testing" membuat refresh token kedaluwarsa setelah 7 hari;
   publikasikan aplikasinya untuk pemakaian jangka panjang.
3. Isi tiga env AdSense, dan di Koneksi & log isi config
   `{ "accountId": "accounts/pub-XXXXXXXXXXXXXXXX" }`. Matikan `mock` bila ada.
4. Uji koneksi, lalu Tarik data sekarang. Laporan yang terpotong (lebih dari
   10.000 baris) gagal dengan pesan; perkecil rentang.

**Lynk.id.** Di dashboard Lynk.id bagian API/webhook, simpan URL webhook yang
ditampilkan di halaman sumber Lynk.id (produksi: `https://<host admin>/api/webhooks/revenue/lynk`),
pilih event `payment.received`, salin merchant key ke `REVENUE_LYNK_MERCHANT_KEY`,
restart, lalu kirim tes dari Lynk.id. Server harus bisa dijangkau dari internet.

**Whop / sumber lain.** Ekspor laporan pembayaran ke CSV/Excel, lalu Impor
file. Contoh file: `docs/contoh/whop-payments-contoh.csv`.

## Produksi

- Migrasi `0003_pendapatan.sql` ikut `pnpm db:migrate` seperti biasa.
- Pilih satu: `REVENUE_SCHEDULER=true` (hanya bila satu replika), atau cron
  `*/15 * * * * pnpm revenue:sync --due` di satu mesin (exit code 1 bila ada run gagal).
- Reverse proxy harus meneruskan `POST /api/webhooks/revenue/*` ke aplikasi
  dengan body utuh; batas body webhook 256 KB.

## Verifikasi manual di UI

1. Login superadmin -> langsung Dashboard. Login editor -> langsung Admin Blog;
   `/api/admin/revenue/overview` untuk editor = 404.
2. Dashboard: ganti rentang (7/30/90 hari), pilih satu sumber, status "Sementara saja",
   situs tertentu; semua angka (total, komposisi, grafik, per situs) ikut berubah.
   Arahkan kursor/tekan panah di grafik: tooltip menampilkan semua sumber. Tombol Tabel
   menampilkan angka yang sama.
3. Adsterra > Tarik data sekarang (mode mock): "0 baru, N sama" bila tidak berubah.
   Dengan `REVENUE_MOCK_REVISION=1` (restart), tarik lagi: baris "diperbarui",
   detail entri menampilkan riwayat angka.
4. Lynk.id > Kirim event uji: event "Diproses (uji)" muncul, ledger tidak bertambah.
5. Impor file > Whop > `docs/contoh/whop-payments-contoh.csv`: pratinjau
   (baru, dilewati karena `failed`), Impor. Impor ulang file yang sama: semua "sama".
6. Transaksi > Catat pemasukan (brand deal, dengan no. invoice); ulangi dengan
   no. invoice sama: ditolak. Adjustment tanpa alasan: ditolak.
7. Buka satu entri > Catat refund sebagian, lalu refund sisanya; refund ketiga ditolak.
8. Kurs: hapus kurs USD bulan ini -> dashboard memperingatkan entri USD baru
   tanpa kurs (setelah ada data baru); tambahkan lagi -> terkonversi.

## Pemeriksaan otomatis

- `pnpm check`: unit test desimal/normalisasi, aturan upsert, tanda tangan dan mapping Lynk.id
  (payload dokumentasi resmi), parsing header AdSense + deteksi laporan terpotong, kunci
  dimensi Adsterra, parser CSV/XLSX/JSON + mapping; test database (idempotensi, trigger
  revisi, kurs, refund, webhook, sync mock, impor, overview).
- `pnpm --filter @framework/web gate:admin` (CI): akses API pendapatan (401/404/200),
  webhook di host site, body rusak, path traversal.
