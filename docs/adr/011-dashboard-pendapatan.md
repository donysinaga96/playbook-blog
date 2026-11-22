# ADR-011: Dashboard pendapatan multi-sumber, ledger terpadu, lima jalur ingest

Status: Diterima (22 Nov 2026)

## Konteks

Pemilik proyek punya pemasukan dari beberapa situs (termasuk situs di luar
framework ini) dan beberapa platform: jaringan iklan (Google AdSense,
Adsterra), penjualan produk digital (Lynk.id, Whop), dan pemasukan non-API
(brand deal). Ia ingin satu tampilan awal setelah login yang menunjukkan
pendapatan harian/bulanan semua sumber, dengan detail per sumber dan per situs.
Admin konten (ADR-009) tetap ada, dibuka lewat tombol "Admin Blog".

Setiap platform menyediakan data dengan cara berbeda: webhook (Lynk.id),
reporting API terjadwal (AdSense, Adsterra), file ekspor (Whop dan lainnya),
dan input manual. Angka jaringan iklan juga berubah: hari berjalan masih
perkiraan dan bisa direvisi beberapa hari kemudian.

## Keputusan

1. **Satu ledger terpadu** `revenue_ledger_entries`. Semua jalur menghasilkan
   bentuk yang sama (`LedgerInput`) dan ditulis lewat satu fungsi
   (`upsertEntries`). Dashboard hanya membaca ledger.
2. **Idempotensi per sumber**: unik `(source_id, idempotency_key)`. Kunci
   dibangun adapter dari identitas data, bukan waktu masuk:
   - Lynk.id `lynk:<refId>:sale` (pengiriman ulang tidak menggandakan saldo);
   - Adsterra `adsterra:<tanggal>:<domain>:<placement>[:<country>][:sub:<sub_id>]`;
   - AdSense `adsense:<tanggal>:<domain>`;
   - impor file `<sumber>:ext:<ID>` bila kolom ID dipetakan, selain itu hash isi baris;
   - manual `manual:<uuid>` atau `manual:ext:<no invoice>`, adjustment `adjustment:<uuid>`, refund `refund:<entri>:<n>`.
3. **Revisi tanpa merusak jejak audit**. Kunci sama + isi sama = `unchanged`;
   isi berubah = `update`, dan trigger database menyalin versi lama ke
   `revenue_ledger_revisions` serta menaikkan `revision`. Database juga
   menolak: mengubah identitas entri, menurunkan `finalized` ke `estimated`,
   dan mengubah baris revisi. Koreksi manual tidak pernah mengubah entri asal:
   adjustment dan refund adalah entri baru (`adjusted`/`refunded`, alasan wajib).
4. **Status angka**: `estimated` (bisa berubah), `finalized`, `adjusted`,
   `refunded`. Adsterra: di luar jendela lookback = final. AdSense: bulan
   berjalan estimated; bulan lalu final mulai tanggal `finalizeDay` (bawaan 7).
5. **Mata uang**: angka asli (`gross_amount`, `currency`) selalu disimpan.
   `normalized_amount` = round(gross x kurs, 2) dalam mata uang utama
   (`REVENUE_BASE_CURRENCY`, bawaan IDR) dengan kurs terakhir <= tanggal
   laporan dari `revenue_fx_rates`, dan kurs itu disimpan di entri. Tanpa kurs,
   entri tetap tersimpan dan tampil sebagai "belum dikonversi"; tidak pernah
   memakai kurs tebakan. Aritmetika uang memakai bigint desimal, bukan float.
6. **Kredensial hanya di env server** (`<credentials_env>_API_TOKEN`, `_CLIENT_ID`,
   `_CLIENT_SECRET`, `_REFRESH_TOKEN`, `_MERCHANT_KEY`). Database hanya menyimpan
   awalan nama env; config sumber ditolak bila memuat kunci yang mirip rahasia.
   API admin hanya melaporkan nama env yang belum diisi, tidak pernah nilainya.
7. **Hak akses**: data pendapatan lintas situs, jadi hanya `users.is_superadmin`.
   User lain mendapat 404 dari API dan diarahkan ke Admin Blog.
8. **Webhook publik** di `/api/webhooks/revenue/:code`, di Host mana pun
   (middleware site melewatinya hanya bila path yang dilihat router persis
   cocok), diamankan tanda tangan. Semua kiriman tercatat di
   `revenue_webhook_events`; payload hanya disimpan bila tanda tangan sah.
   Balasan: 200 (termasuk duplikat), 400 bentuk salah, 401 tanda tangan
   salah, 503 merchant key belum dipasang (agar pengirim mengulang).
9. **Tarik terjadwal**: penjadwal di proses web hanya bila `REVENUE_SCHEDULER=true`
   (asumsi satu replika, sama seperti ADR M5-I); alternatifnya
   `pnpm revenue:sync --due` dari cron. Paling banyak satu run berjalan per
   sumber (index unik `status = 'running'`).
10. **Headless/otomasi browser** hanya sebagai kerangka: nonaktif bawaan
    (`REVENUE_HEADLESS_ENABLED` dan `config.enabled`), tanpa scraper sungguhan
    di repo, dengan batas waktu dan log run terpisah.
11. **Mode mock** (`REVENUE_MOCK=true` atau `config.mock`) mengganti jaringan
    saja: fetch palsu menjawab dengan bentuk respons asli, sehingga parsing,
    normalisasi, dan UI teruji tanpa kredensial.
12. **Situs** (`revenue_properties`) terpisah dari `sites`: situs luar framework
    juga bisa dicatat. Tautan opsional ke site framework memakai
    `linked_site_id` (bukan `site_id`, karena konvensi repo: `site_id` = data
    milik satu site).

## Alternatif yang ditolak

- **Tabel terpisah per platform** (adsense_reports, lynk_orders, ...): setiap
  agregasi dashboard harus UNION semua tabel, dan sumber baru butuh migrasi.
  Metrik khusus platform cukup di `metrics_json` dan `dimensions`.
- **Menimpa angka tanpa riwayat**: angka iklan memang direvisi; tanpa riwayat
  tidak bisa menjelaskan kenapa total kemarin berbeda dengan hari ini.
- **Menyimpan token di database (terenkripsi)**: butuh pengelolaan kunci enkripsi
  dan alur OAuth di UI. Env server lebih sederhana untuk satu pemilik.
- **Konversi kurs saat query dengan kurs terbaru**: total masa lalu berubah setiap
  kurs diperbarui. Kurs disimpan di entri; hitung ulang bersifat eksplisit dan tercatat.
- **Library chart / spreadsheet** (Chart.js, SheetJS): grafik cukup SVG kecil;
  pembaca .xlsx minimal (zip + XML) cukup untuk worksheet pertama, tanpa
  menambah dependensi besar.

## Konsekuensi

- Sumber API baru = adapter baru di `packages/core/src/revenue/adapters` + nilai
  `connector`; sumber impor/manual bisa ditambah dari admin tanpa kode.
- Lynk.id tidak mengirim event refund (dokumentasi resmi hanya `payment.received`);
  refund dicatat manual dari detail entri.
- Data pendapatan masuk backup database yang sama (`pnpm db:backup`).
- `raw_payload` Lynk.id memuat data pembeli (nama, email, telepon) untuk audit;
  hanya superadmin yang bisa melihatnya.
