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
