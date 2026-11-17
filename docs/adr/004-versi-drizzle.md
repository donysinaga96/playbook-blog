# ADR-004: Versi Drizzle

- Status: Diterima
- Tanggal: 2026-11-17

## Konteks

Drizzle hanya dipakai sebagai query builder bertipe dan untuk `drizzle-kit pull`; migration
ditulis SQL (ADR-003). Per 17 Nov 2026 di npm:

| Kanal | drizzle-orm | drizzle-kit | Rilis |
| --- | --- | --- | --- |
| `latest` (stabil) | 0.45.4 | 0.31.11 | 8 Okt 2026 |
| `rc` | 1.0.0-rc.5 | 1.0.0-rc.5 | 21 Okt 2026 |

Drizzle 1.0 mengubah struktur folder migration dan API relasi. Struktur folder migration tidak
berdampak di sini; perubahan API relasi berdampak ke semua query yang memakai relasi.

## Keputusan

Mulai M1 dengan **drizzle-orm dan drizzle-kit 1.0.0-rc.5**, versi dipasang persis (tanpa `^`).
Naik ke 1.0.0 stabil begitu dirilis. Bila RC menghalangi pekerjaan (bug pada introspeksi
PostgreSQL atau composite FK), turun ke 0.45.x dan catat di ADR ini.

## Alternatif yang ditolak

- **0.45.x stabil sekarang, upgrade nanti.** Semua query relasi yang ditulis selama M1 sampai
  M4 harus ditulis ulang saat pindah ke API relasi 1.0.
- **Tanpa ORM (SQL mentah + tipe tulisan tangan).** Tipe hasil query mudah tidak sinkron
  dengan schema; Drizzle memberi tipe dari `drizzle-kit pull`.

## Konsekuensi

- Versi RC dipasang persis agar perubahan antar-RC tidak masuk diam-diam.
- Test repository di `packages/core` (M1) menjadi pengaman saat upgrade RC ke stabil.
- Keputusan ini perlu ditinjau lagi sebelum produksi pertama (M5).
