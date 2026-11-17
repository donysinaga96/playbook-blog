# ADR-002: Satu aplikasi Nuxt, tanpa NestJS

- Status: Diterima
- Tanggal: 2026-11-17

## Konteks

Dokumen rancangan lama memakai Nuxt untuk tampilan dan NestJS terpisah untuk API, ditambah
Redis/BullMQ, dengan asumsi 2 developer. Proyek ini dikerjakan solo, dan belum ada pihak
ketiga yang butuh API.

## Keputusan

Satu aplikasi Nuxt 4 (`apps/web`) melayani public site, `/admin`, dan server routes. Logika
domain ada di `packages/core` dan dipanggil dari server routes. Server routes ditulis memakai
import `nuxt/server` (diperkenalkan di Nuxt 4.6) agar upgrade ke Nuxt 5 murah.

## Alternatif yang ditolak

- **NestJS terpisah sejak awal.** Dua aplikasi, dua deploy, dan kontrak HTTP internal yang
  harus dirawat tanpa ada konsumen lain.
- **Redis/BullMQ sejak awal.** Belum ada job berat; artikel terjadwal cukup memakai
  `published_at` di masa depan.

## Konsekuensi

- `packages/core` tidak boleh bergantung pada Nuxt atau h3, agar bisa dipasang ke NestJS bila
  nanti API dibuka untuk aplikasi mobile atau pihak ketiga.
- Queue baru ditambah saat fitur AI atau scheduler berbasis event masuk (M6+).
