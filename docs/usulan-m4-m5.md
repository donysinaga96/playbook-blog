# Usulan M4 dan M5

Status: usulan M4 disetujui 21 Nov 2026 (E ditunda ke backlog); usulan M5 dan S1–S2 menunggu persetujuan.
Pemeriksaan poin M4 dan M5 ada di [TASKS.md](../TASKS.md#m4--admin-minimal). Setelah disetujui, huruf usulan tetap dipakai sebagai penanda di rincian TASKS.md, seperti M2 dan M3.
Usulan ini mengandaikan usulan M3 (terutama B, manifest server, dan D, `migrateConfig`) disetujui.

## M4 — Admin minimal

- **[A] ADR-009 admin.** Admin dilayani di `/admin` dengan API di `/api/admin/*`, dan site middleware melewati kedua prefix itu. Mode `multi`: admin hanya di host khusus `ADMIN_HOST` (dev: `admin.localhost`) dan mengelola semua site milik user. Mode `single`: admin di domain site itu. Admin dirender sebagai SPA (`ssr: false` lewat `routeRules`); sesi memakai cookie terenkripsi tanpa tabel sesi. *Alasan:* "mode semua site" butuh satu tempat yang tidak terikat Host satu site; admin tidak butuh SEO, jadi SPA menghindari masalah hidrasi dan tidak mengubah ADR-007. *Ditolak:* admin di setiap domain site, karena cookie sesi terpisah per domain dan admin multi-site harus login berkali-kali; aplikasi admin terpisah, karena menambah satu deploy di M5.
- **[B] CLI `pnpm admin:create`.** Membuat user `ACTIVE` dan `site_members` `OWNER`; password dibaca dari prompt. *Alasan:* belum ada cara membuat admin pertama, dan gate M4 melarang menyentuh database manual.
- **[C] Block editor sendiri untuk 6 tipe block v1.** *Alasan:* skema block v1 kecil dan sudah divalidasi Zod di server. Editor pihak ketiga punya format JSON sendiri yang harus dikonversi bolak-balik, sehingga validasi server tidak lagi satu-satunya sumber kebenaran. *Alternatif:* editor pihak ketiga (TipTap, Editor.js) bila nanti dibutuhkan rich text di dalam paragraf.
- **[D] Preview tema di host admin.** Config draf disimpan di sesi admin; halaman `/admin/preview/<site>/<path>` dirender SSR dengan template site dan config draf, `noindex`, tanpa cache. *Alasan:* theme aktif tidak tersentuh, dan tidak ada cookie lintas domain karena preview ada di host admin (usulan A).
- **[E] Pulihkan revisi.** *Alasan:* poin "revisi otomatis" hanya menyimpan snapshot; tanpa tombol pulihkan, snapshot itu hanya bisa dipakai lewat SQL manual. Pulihkan ditulis sebagai update baru agar riwayat tidak hilang. *Boleh ditunda* ke backlog bila M4 ingin lebih kecil.
- **[F] Gate M4 sebagai skrip di CI.** `apps/web/scripts/gate-admin.mjs` memanggil API admin dan halaman publik pada server hasil build, di job `build`. *Alasan:* gate M2 sudah terbukti di pipeline dengan cara yang sama; gate M4 bisa diuji tanpa browser.
- **[G] Pengamanan dasar admin.** Rate limit login per IP + email, pemeriksaan `Origin` untuk method non-GET, pesan login gagal yang seragam, `/security-review` setelah 4.0, 4.3, dan seluruh M4. *Alasan:* admin adalah permukaan tulis pertama, dan di M5 ia terbuka ke internet.

## M5 — Produksi pertama

- **[A] Container dan reverse proxy dengan TLS otomatis per domain.** Kandidat utama: Caddy dengan on-demand TLS yang bertanya ke endpoint aplikasi apakah domain ada di `site_domains`. Pilihan akhir lewat riset 5.0 dan ADR-010. *Alasan:* site baru tidak perlu mengubah konfigurasi proxy; pemeriksaan ke `site_domains` mencegah orang lain memicu penerbitan sertifikat untuk domain sembarang.
- **[B] Deploy dari CI.** Image dibangun dan diuji di CI, diberi tag commit, lalu VPS menarik image yang sama (job manual). Migration jalan sebelum restart; rollback = tag sebelumnya. *Alasan:* yang di-deploy sama persis dengan yang lulus test. *Alternatif:* build langsung di VPS (lebih sederhana, tetapi image produksi tidak pernah diuji CI).
- **[C] Backup database dan media di luar VPS + skrip restore.** *Alasan:* gate M5 mensyaratkan restore berhasil; file media tidak ada di database; backup di VPS yang sama hilang bersama VPS-nya.
- **[D] Kunci cache memuat Host, dibuktikan dengan gate paralel.** *Alasan:* isolasi antar-site adalah aturan inti (gate M2). Cache tanpa Host di kuncinya akan menyajikan halaman site lain, dan gate paralel yang dijalankan melewati cache menangkap kesalahan itu.
- **[E] Monitoring mulai dari log terstruktur.** Log JSON per request + uptime check eksternal + query ukuran database harian. Layanan error tracking dipilih di ADR-010. *Alasan:* latency dan error per site bisa dihitung dari log tanpa layanan tambahan; layanan baru ditambah bila log saja tidak cukup.
- **[F] Runbook operasional.** `docs/operasional.md`: deploy, rollback, restore, rotasi secret. *Alasan:* restore biasanya dilakukan saat panik; langkah yang sudah diuji di 5.3 perlu tertulis.

## Keputusan

| Usulan | Disetujui? | Catatan |
|---|---|---|
| M4-A — ADR-009 admin (host, SPA, sesi) | Ya, 21 Nov 2026 | |
| M4-B — CLI admin:create | Ya, 21 Nov 2026 | |
| M4-C — Block editor sendiri | Ya, 21 Nov 2026 | |
| M4-D — Preview tema di host admin | Ya, 21 Nov 2026 | |
| M4-E — Pulihkan revisi | Ditunda | Masuk backlog setelah M5 |
| M4-F — Gate M4 di CI | Ya, 21 Nov 2026 | |
| M4-G — Pengamanan dasar admin | Ya, 21 Nov 2026 | |
| M5-A — Proxy TLS per domain (ADR-010) | | |
| M5-B — Deploy dari CI | | |
| M5-C — Backup + restore | | |
| M5-D — Kunci cache dengan Host | | |
| M5-E — Monitoring dari log | | |
| M5-F — Runbook | | |
| S1 — `/init` untuk CLAUDE.md | | |
| S2 — Skill proyek `/gate` | | |
