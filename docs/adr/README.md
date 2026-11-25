# Architecture Decision Records

Satu file per keputusan yang mahal diubah: `NNN-judul.md`, dengan bagian Konteks, Keputusan,
Alternatif yang ditolak, Konsekuensi, dan Status (Diusulkan, Diterima, Diganti oleh ADR-NNN).

| ADR | Keputusan | Status |
| --- | --- | --- |
| [001](001-mode-deploy.md) | Satu schema, dua mode deploy (single-site / multi-site) | Diterima |
| [002](002-nuxt-tanpa-nestjs.md) | Satu aplikasi Nuxt, tanpa NestJS | Diterima |
| [003](003-migration-sql-tangan.md) | Migration ditulis SQL tangan | Diterima |
| [004](004-versi-drizzle.md) | Drizzle 1.0.0-rc.5, dipasang persis | Diterima |
| [005](005-kontrak-template.md) | Kontrak template: komponen sama, tampilan berbeda | Diterima |
| [006](006-skema-url.md) | Skema URL publik: permalink artikel per site, prefix Inggris, `/p/{slug}`, `?page=N` | Diterima |
| [007](007-render-halaman-server.md) | Halaman publik dirender penuh di server; view model dibangun di Nitro | Diterima |
| [008](008-kontrak-section.md) | Section di base, manifest server (`./manifest`), theme diselesaikan sebelum view model | Diterima |
| [009](009-admin.md) | Admin: host khusus (multi) / domain site (single), SPA, sesi cookie terenkripsi, Argon2id, CLI admin pertama | Diterima |
| [010](010-alur-konten-ai.md) | Alur konten AI: tabel hasil AI terpisah (`generated_articles`), role `blog_agent`, approval memindahkan ke tabel konten, referensi tampil | Diterima |
| [011](011-dashboard-pendapatan.md) | Dashboard pendapatan: ledger terpadu, idempotensi per sumber, revisi via trigger, kredensial hanya di env, hanya superadmin, webhook publik bertanda tangan | Diterima |
| [012](012-infrastruktur-produksi.md) | Produksi pertama: satu VPS, Docker Compose, Caddy TLS on-demand (izin dari `site_domains`), domain sementara sslip.io, image dari CI, deploy SSH forced command, backup harian ke R2 | Diterima |
