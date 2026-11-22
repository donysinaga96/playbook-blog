Kamu adalah Principal Full-Stack & Backend Engineer. Saya ingin mengimplementasikan fitur **Multi-Source Revenue Admin Dashboard** di atas **web admin yang sudah ada** di repository/workspace ini.

### 0. Aturan Penggunaan Skills (Wajib & Selektif)
1. Periksa daftar *skills* yang tersedia di *environment* saat ini (hanya dari direktori skills aktif atau repository tepercaya yang sudah terpasang/tersedia, seperti *skills* resmi dari Anthropic atau *skills* yang sudah diverifikasi kredibilitas dan adopsinya oleh komunitas).
2. **Jangan mengarang nama skill** dan **jangan memakai skill dari sumber tidak jelas/belum terverifikasi**. Jika ada skill yang relevan (misalnya untuk desain frontend/UI, database/SQL, testing, atau workflow coding yang tepercaya), **baca instruksinya terlebih dahulu** lalu terapkan secara nyata ke implementasi—bukan sekadar menyebutkannya. Jika skill yang tersedia tidak cocok untuk bagian tertentu, kerjakan langsung dengan *best practice* engineering yang kuat.

---

### 1. Tahap Awal: Audit Web Admin yang Sudah Ada
Sebelum mengubah kode, pelajari struktur proyek saat ini dan laporkan secara ringkas:
- Tech stack frontend, backend, ORM/database, autentikasi, state management, dan pola routing/API yang sudah dipakai.
- Cara menambahkan halaman/menu admin baru, endpoint API, background job/scheduler, serta konvensi penamaan & error handling yang berlaku di repo ini agar fitur baru menyatu secara konsisten.

---

### 2. Rancangan Database (Unified Ledger + 5 Ingestion Channels)
Rancang dan siapkan skema database (beserta migrasi sesuai ORM/DB proyek) yang mendukung **5 cara pemasukan data**:
1. **Webhook** (*push* event pembayaran/transaksi, mis. Lynk.id).
2. **REST API / Reporting API** (*pull* terjadwal/cron/worker, mis. Adsterra & Google AdSense).
3. **Impor File (CSV / Excel / JSON)** dengan *preview/mapping*, validasi baris, dan pelacakan batch impor.
4. **Otomasi Browser / Headless Scraper** (opsional/terisolasi dengan status job, log error, dan *safeguard* konfigurasi).
5. **Input Manual / Adjustment Entry** (untuk *brand deal*/pemasukan non-API dan koreksi rekonsiliasi).

Pastikan skema mencakup:
- **Master sumber pendapatan (`revenue_sources`)**: kode/slug (`lynk`, `adsterra`, `adsense`, `custom_csv`, dll.), tipe integrasi, status aktif, konfigurasi non-rahasia, serta referensi kredensial terenkripsi di server/env.
- **Ledger pendapatan terpadu (`revenue_ledger_entries`)**: `id`, `source_id`, `channel_type` (`webhook` | `api` | `csv_import` | `headless` | `manual`), `external_id` / `idempotency_key`, `occurred_at` & `report_date`, `gross_amount`, `currency`, `fx_rate_to_base` & `normalized_amount` (mis. IDR sebagai mata uang utama dashboard), `status` (`estimated` | `finalized` | `adjusted` | `refunded`), `metrics_json` (opsional untuk metrik iklan seperti impressions/clicks/CPM/RPM), `raw_payload` / metadata audit, dan `created_at` / `updated_at`.
- **Log sinkronisasi & impor (`sync_runs` / `import_batches`)**: mencatat waktu jalan, rentang tanggal/periode, jumlah data masuk/diperbarui/dilewati, status sukses/gagal, dan pesan error untuk *troubleshooting*.
- **Aturan idempotensi & revisi**: cegah duplikasi saat webhook terkirim ulang atau impor CSV berulang, sekaligus dukung pembaruan angka *estimated* menjadi *finalized* atau pencatatan *adjustment* tanpa merusak jejak audit.

---

### 3. Rancangan UI & Fungsional Web Admin
Bangun tampilan admin yang bersih, informatif, dan praktis untuk memantau pendapatan harian/bulanan:
1. **Main Revenue Dashboard**:
   - **KPI Summary Cards**: Total pendapatan periode terpilih (dalam mata uang utama + konversi), perbandingan terhadap periode sebelumnya, pendapatan hari ini/bulan ini, dan *breakdown* kontribusi per sumber.
   - **Visualisasi & Filter**: Grafik tren pendapatan (harian/mingguan/bulanan, *stacked* atau *multi-series* per sumber), filter *date range*, filter sumber, filter status (`estimated` vs `finalized`), dan tombol *trigger sync* / *import*.
   - **Recent Activity & Sync Health**: Daftar transaksi/laporan terbaru serta indikator status *sync/webhook/import* agar langsung terlihat jika ada konektor yang gagal.
2. **Menu Detail per Sumber Pemasukan (Wajib Ada Contoh Spesifik)**:
   - Sediakan navigasi/menu detail khusus untuk contoh sumber yang disebutkan:
     - **Lynk.id**: ringkasan penjualan produk/link, metrik order/pendapatan, status webhook terakhir, dan tabel transaksi/event masuk.
     - **Adsterra**: ringkasan metrik *impressions*, *clicks*, *CPM/eCPM*, *revenue*, filter domain/placement/tanggal, dan riwayat *pull* API.
     - **Google AdSense**: ringkasan *estimated earnings*, *page views / clicks / RPM* (sesuai data yang tersedia dari API/laporan), status koneksi OAuth/API, dan riwayat sinkronisasi.
     - Serta menu/halaman generik untuk **Sumber Lain (CSV / Headless / Manual)** agar mudah ditambah tanpa duplikasi kode berlebihan.
3. **Halaman / Drawer Operasional untuk 5 Cara Input**:
   - Form & panel **Manual Entry / Adjustment** (dengan alasan/catatan audit).
   - Wizard/modal **CSV/Excel/JSON Import** (unggah file, *column mapping* / validasi *preview*, hasil *inserted/updated/skipped/errors*).
   - Panel **Webhook & API / Headless Config & Sync Logs** (test koneksi/sync manual, lihat log error, kelola jadwal).

---

### 4. Implementasi Service Backend & Kontrak Adapter
Implementasikan service backend yang modular dan aman menggunakan pola **Adapter / Connector per sumber**:
- **Keamanan**: jangan pernah mengekspos API key, OAuth secret, atau webhook secret ke frontend; validasi *signature/token* pada *endpoint* webhook; lindungi seluruh *endpoint* admin dengan autentikasi & otorisasi yang sudah ada di proyek.
- **Kontrak Adapter & 5 Jalur Ingestion**:
  1. **Lynk.id Webhook Adapter (`push`)**:
     - Terima HTTP `POST` event pembayaran (mis. `order.paid` / `order.completed`, serta tangani refund/pembatalan secara aman), verifikasi secret/signature, balas cepat (`2xx`) untuk mencegah *retry* berlebih, dan bangun `idempotency_key` dari identitas event/order + tipe event agar *duplicate delivery* tidak menggandakan saldo. Simpan `raw_payload` utuh untuk audit.
  2. **Adsterra Publisher API Adapter (`pull` terjadwal)**:
     - Tarik laporan statistik menggunakan API token server-side dengan parameter rentang tanggal (`start_date`, `finish_date`), filter/pengelompokan (`date`, `domain`, `placement`, `country`, `sub_id`), dan metrik (`impressions`, `clicks`, `ctr`, `cpm`, `revenue`).
     - Bangun `idempotency_key` berbasis kombinasi `source` + `report_date` + dimensi (`domain` / `placement` / `country` / `sub_id`) sehingga *re-sync* melakukan *upsert* yang aman dan mendukung *lookback window* beberapa hari terakhir untuk revisi angka.
  3. **Google AdSense Management API v2 Adapter (`pull` terjadwal via OAuth 2.0)**:
     - Tarik laporan menggunakan OAuth 2.0 (`adsense.readonly`) ke endpoint `accounts/{account}/reports:generate` (atau `:generateCsv`), perhatikan `reportingTimeZone`, `currencyCode`, dan cek `totalMatchedRows` agar tidak terpotong diam-diam.
     - Lakukan *header-driven parsing* pada `headers` dan `rows` (`ESTIMATED_EARNINGS`, `IMPRESSIONS`, `CLICKS`, `PAGE_VIEWS`, `PAGE_VIEWS_RPM`, `IMPRESSIONS_RPM`, `COST_PER_CLICK`, serta baca `currencyCode` dari header metrik mata uang). Petakan hari/periode yang masih berjalan/terbaru ke `status: 'estimated'` dan periode final ke `status: 'finalized'`.
  4. **CSV / Excel / JSON Import Service**:
     - Parser dengan validasi per baris, *column mapping*, deteksi duplikasi, dan pelaporan jelas baris mana yang *inserted/updated/skipped/error*.
  5. **Headless / Browser Automation Runner (Opsional & Terisolasi)**:
     - Buat secara *pluggable* dan mudah dinonaktifkan (`enabled: false` secara default) karena paling rawan rusak akibat perubahan UI/2FA/CAPTCHA serta menyangkut *Terms of Service* platform; catat status job dan error log secara terisolasi.
  6. **Manual Entry & Adjustment Service**:
     - Pencatatan pemasukan non-API atau koreksi/penyesuaian ke ledger terpadu dengan jejak audit dan mata uang/kurs yang tercatat.
- **Mock / Sandbox Mode**:
  - Sediakan mode *mock/fixture* yang bersih dan mudah diaktifkan via konfigurasi/env untuk Adsterra dan Google AdSense (serta endpoint uji webhook Lynk.id) agar seluruh alur backend, normalisasi mata uang, dan tampilan UI bisa langsung diuji sebelum kredensial produksi dipasang.

---

### 5. Eksekusi & Verifikasi
- Kerjakan implementasi secara bertahap dan terstruktur di codebase ini.
- Tuliskan unit/integration test untuk bagian krusial (terutama *idempotency*, normalisasi mata uang/ledger, *header-driven parsing* AdSense, *upsert* dimensi Adsterra, *webhook* Lynk.id, *CSV parser*, dan *adapter* sumber).
- Di akhir, berikan cara menjalankan migrasi/konfigurasi *environment variables*, keterbatasan/hal yang perlu dilengkapi dengan kredensial asli, serta langkah verifikasi manual di UI.
- jika ada saran dan task yang masih tertunda tuliskan di sebuah catatn di folder docs
