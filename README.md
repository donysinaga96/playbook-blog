# Blog Framework

Framework web artikel multi-site / multi-template. Satu codebase dan satu schema PostgreSQL
di-deploy menjadi beberapa blog dengan tampilan berbeda. Semua template memakai komponen UI yang
sama dari `templates/base`; perbedaan antar site datang dari design token, CSS, susunan section,
serta menu dan submenu yang mengikuti konten tiap site.

Rencana lengkap, keputusan arsitektur, dan roadmap M0–M5 ada di dokumen
*Revisi Implementation Guide — Framework Web Artikel Multi-Template* (Google Drive).

## Struktur

```
apps/
  web/              Nuxt: public site + /admin + server/api            (M2)
packages/
  db/               migration SQL, seed, test integritas, schema Drizzle
  core/             domain: repository data, validasi Zod, block body, view model
  template-kit/     kontrak template: defineTemplate, tipe view model, token -> CSS variable
templates/
  base/             semua komponen UI default
  magazine/         template pertama
  news/             template kedua, pembuktian kontrak
docs/
  dev-setup.md      setup development (Docker, role database, migration)
  adr/              catatan keputusan arsitektur
```

Aturan dependency: `templates/*` hanya boleh import `@framework/template-kit`, tidak pernah
`core` atau `db`.

## Mulai

Butuh Node 24 (`nvm use`), Docker, dan pnpm lewat corepack:

```bash
corepack enable pnpm
pnpm install
cp .env.example .env        # lalu ganti password
pnpm db:up                  # PostgreSQL 18.7 + migration + role aplikasi + seed
pnpm db:test                # 50 pemeriksaan packages/db
```

| Script | Fungsi |
| --- | --- |
| `pnpm check` | Lint + typecheck + test (sama dengan job `check` di CI) |
| `pnpm lint` | ESLint, termasuk aturan import template (ADR-005) |
| `pnpm typecheck` | TypeScript mode strict (`tsconfig.base.json`) |
| `pnpm test` | Vitest |
| `pnpm db:up` | Menyalakan database, menjalankan migration, role aplikasi, dan seed |
| `pnpm db:migrate` | Menjalankan migration baru + seed |
| `pnpm db:pull` | Membuat ulang schema Drizzle dari database (`packages/db/src/schema/`) |
| `pnpm db:test` | Uji lengkap `packages/db` di database terpisah |
| `pnpm db:psql` | Masuk psql sebagai pemilik schema |
| `pnpm db:adminer` | Adminer di http://localhost:8080 |
| `pnpm db:down` | Mematikan database (data tetap) |
| `pnpm db:reset` | Mengulang dari nol (data dev hilang) |

CI GitLab (`.gitlab-ci.yml`) menjalankan job `check` (Node 24) dan `db` (`run_all.sh` di
PostgreSQL 18.7). Keputusan arsitektur dicatat di [docs/adr/](docs/adr/README.md).

Catatan versi: TypeScript dikunci di `~6.0` karena typescript-eslint belum mendukung
TypeScript 7 (peer `typescript <6.1.0`).

Detail ada di [docs/dev-setup.md](docs/dev-setup.md) dan [packages/db/README.md](packages/db/README.md).
