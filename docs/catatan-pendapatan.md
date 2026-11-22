# Catatan dashboard pendapatan: task tertunda dan saran

Dicatat 22 Nov 2026 setelah implementasi pertama (ADR-011). Urutan bukan
prioritas.

## Butuh tindakan pemilik proyek

- [ ] **Kredensial asli**: isi env Adsterra, AdSense (OAuth), dan Lynk.id (lihat
      [pendapatan.md](pendapatan.md#memasang-kredensial-asli)), matikan
      `REVENUE_MOCK`, lalu jalankan Uji koneksi per sumber. Adapter Adsterra dan
      Lynk.id ditulis dari dokumentasi resmi (spec OpenAPI Adsterra v3, Postman "Lynk
      Webhook"), adapter AdSense dari dokumentasi Management API v2; semuanya belum
      pernah menerima respons sungguhan.
- [ ] **Hapus data contoh** sebelum data asli masuk: `pnpm revenue:demo --remove`.
- [ ] **Kurs resmi**: kurs USD->IDR contoh bukan kurs resmi. Isi kurs per bulan (mis.
      kurs tengah BI) di menu Kurs, atau terima usulan "kurs otomatis" di bawah.
- [ ] **Domain asli situs**: setelah domain dibeli, ubah domain di Kelola situs bila
      berbeda dari contoh (beritakonoha.id, kabartekno.id, ...). Entri lama
      berdomain sama otomatis terhubung.
- [ ] **Whop**: konfirmasi format ekspor pembayaran Whop yang dipakai, lalu simpan
      mapping-nya (lihat usulan "preset mapping").

## Perlu diverifikasi dengan data asli

- Tanda tangan Lynk.id dihitung dari `grandTotal` sebagai teks persis seperti di JSON
  (`72000` -> `"72000"`). Bila Lynk.id mengirim nominal berdesimal atau sebagai string
  berformat, cocokkan dengan contoh kiriman asli (event ditolak 401 akan terlihat di
  Event masuk).
- `createdAt` Lynk.id diasumsikan waktu WIB tanpa zona (config `timezone`).
- Revenue Adsterra diasumsikan USD; laporan Adsterra tidak menyebut mata uang.
- AdSense: angka final diasumsikan stabil mulai tanggal 7 bulan berikutnya
  (`finalizeDay`), dan `ESTIMATED_EARNINGS` dipakai sebagai nominal.
- Placement Adsterra tampil sebagai ID; nama placement belum diambil dari
  `/placements.json`.

## Usulan (belum dikerjakan, masing-masing dengan alasan)

1. **Adapter webhook Whop.** Whop punya webhook pembayaran; saat ini Whop lewat impor
   file. Perlu dokumentasi resmi format dan tanda tangannya dulu (tidak dikarang).
2. **Alur OAuth AdSense di admin** (tombol "Hubungkan akun Google"), menggantikan
   refresh token manual di env. Butuh penyimpanan token terenkripsi di database dan
   ADR tersendiri.
3. **Kurs otomatis harian** dari penyedia kurs, tetap disimpan per tanggal di
   `revenue_fx_rates` agar total lama tidak berubah diam-diam.
4. **Preset mapping impor per sumber**: mapping terakhir yang berhasil disimpan di
   config sumber, sehingga impor bulanan cukup unggah lalu Impor.
5. **Notifikasi konektor gagal** (sync gagal 2x berturut-turut, webhook ditolak, belum
   ada data hari ini sampai jam tertentu) lewat email/Telegram.
6. **Target bulanan dan proyeksi** (run-rate bulan berjalan vs target) di dashboard.
7. **Ekspor CSV** dari halaman Transaksi untuk pembukuan/pajak.
8. **Scraper headless sungguhan** hanya untuk platform tanpa API/ekspor, setelah
   memeriksa Terms of Service platform itu. Kerangkanya sudah ada (nonaktif bawaan).
9. **Penyamaran data pembeli** di `raw_payload` Lynk.id (nama/email/telepon) bila
   tidak dibutuhkan untuk audit, atau masa simpan terbatas.
10. **Pemeriksaan `run_all.sh`** untuk trigger ledger (sudah diuji lewat Vitest terhadap
    database; menambahkannya ke paket SQL membuat paket database bisa diuji mandiri).
11. **Browser check** halaman dashboard di `pnpm --filter @framework/web browser-check`
    (hidrasi tidak relevan karena admin SPA, tetapi galat konsol bisa ditangkap).
