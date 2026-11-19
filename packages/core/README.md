# packages/core

Domain framework: validasi (Zod), block body, dan repository data. Tidak bergantung pada Nuxt
atau h3 (ADR-002), supaya bisa dipasang ke server lain bila nanti perlu.

```
src/content/blocks.ts              block body v1 + parseBody (ketat) + parseBodyLenient (render)
src/content/extract-body-text.ts   teks polos untuk articles.body_text
src/site/settings.ts               skema sites.settings
src/repositories/                  repository data (lihat di bawah)
```

## Repository

```ts
import { createDatabase, databaseUrlFromEnv } from '@framework/db'
import { createRepositories } from '@framework/core'

const repos = createRepositories(createDatabase({ connectionString: databaseUrlFromEnv() }))

const found = await repos.sites.findByDomain(host)           // resolver: Host -> site
if (!found) return notFound()
const siteId = found.site.id

const theme = await repos.sites.getActiveTheme(siteId)
const feed = await repos.content.listPublishedArticles(siteId, { categorySlug: 'gadget', page: 2 })
const menu = await repos.menus.getMenuTree(siteId, 'header')
```

| Repository | Fungsi |
| --- | --- |
| `sites` | `findByDomain(host)`, `findByCode(code)`, `getActiveTheme(siteId)` |
| `content` | `listPublishedArticles`, `searchPublishedArticles`, `getPublishedArticle`, `getPublishedPage`, `getCategoryTree`, `getCategory`, `getTag`, `getAuthor`, `findRedirect` |
| `menus` | `getMenuTree(siteId, location)` |

### Aturan

1. **Setiap fungsi menerima `siteId` sebagai argumen pertama.** Satu-satunya pengecualian adalah
   resolver `sites.findByDomain` dan `sites.findByCode`, karena tugasnya menemukan siteId.
   Compiler memeriksa ini lewat `satisfies`, dan `repositories.test.ts` mengharuskan setiap
   fungsi baru didaftarkan di test isolasi.
2. **Setiap query menyaring `site_id` pada setiap tabel yang disentuh**, walau composite FK sudah
   menjamin relasinya satu site. Slug yang sama di dua site ("tentang-kami", "redaksi") tidak
   pernah tertukar.
3. **Hanya konten publik yang keluar**: `PUBLISHED` dan `published_at <= now`. Artikel terjadwal
   muncul sendiri saat waktunya tiba, tanpa queue. Jam bisa disuntik lewat
   `createRepositories(db, { now })` untuk test.
4. **Status HIDDEN**: kategori dan penulis HIDDEN tidak bisa dibuka, tidak muncul di pohon, dan
   filternya kosong. Artikel di dalamnya tetap tampil; byline-nya kosong bila penulisnya HIDDEN.
5. **Body dibaca longgar**: block yang tidak dikenal dilewati dan dilaporkan di `bodyIssues`
   (untuk dicatat ke log); halaman tidak crash.
6. **Menu tidak pernah memuat tautan mati**: item nonaktif atau yang tujuannya tidak tampil
   dibuang bersama turunannya. Repository mengembalikan tujuan (`target`), bukan URL; pola route
   milik lapisan view model.
7. Hanya `@framework/db` yang bergantung pada `drizzle-orm`; operator query diekspor ulang dari
   sana agar hanya ada satu salinan Drizzle saat runtime.

## Test

`pnpm test` menjalankan semuanya. Test yang membaca database butuh `pnpm db:up` dan
`DATABASE_URL` (dibaca dari `.env`); tanpa itu dilewati. Di CI database wajib ada
(`tests/ci-guard.test.ts`).
