// Repository tulis untuk admin (M4 4.1, revisi dan redirect 4.5).
//
// Aturan yang sama dengan repository baca: setiap fungsi menerima siteId
// sebagai argumen pertama, dan setiap baris yang dibaca atau ditulis
// dibatasi site itu. Referensi lintas tabel (kategori, penulis, media, tag,
// induk, target menu) dicek milik site yang sama; site lain = "tidak
// ditemukan" (EditorError), bukan error database.
//
// Konkurensi: artikel memakai kolom version (naik setiap simpan, = nomor
// revisi). Tabel tanpa kolom version (halaman, kategori, tag, item menu)
// memakai updatedAt yang dibaca saat form dibuka. Token berbeda -> conflict.
//
// Artikel: setiap simpan menulis snapshot ke article_revisions dalam
// transaksi yang sama. Slug/URL artikel atau halaman yang sudah tampil
// publik berubah -> redirect 301 dari path lama, rantai diratakan.
import {
  and,
  articleRevisions,
  articles,
  articleTags,
  asc,
  authors,
  categories,
  count,
  desc,
  eq,
  inArray,
  media,
  menuItems,
  menus,
  ne,
  or,
  pages,
  redirects,
  sites,
  sql,
  tags,
  type PgColumn,
  type SQL,
} from '@framework/db'
import type { z } from 'zod'
import type { Body } from '../content/blocks'
import { extractBodyText } from '../content/extract-body-text'
import type { ContentSeo } from '../content/seo'
import { parseSiteSettings } from '../site/settings'
import { createUrlBuilder } from '../views/urls'
import type { Page, RepositoryContext, SiteId, SiteScoped } from '../repositories/types'
import { normalizePaging, toPage } from '../repositories/types'
import { conflict, EditorError, editorErrorMap, invalid, notFound, type FieldIssue } from './errors'
import {
  articleInputSchema,
  categoryInputSchema,
  menuItemInputSchema,
  pageInputSchema,
  mediaMetaSchema,
  tagInputSchema,
  updatedAtSchema,
  versionSchema,
  type ArticleInput,
  type MenuItemInput,
} from './inputs'
import { isReservedFirstSegment, permalinkFirstToken, slugCandidate, slugify } from './slug'

type Tx = Parameters<Parameters<RepositoryContext['db']['transaction']>[0]>[0]
type Db = RepositoryContext['db'] | Tx
/** Tabel konten bersiteId yang dicek kepemilikannya. */
type OwnedTable = typeof articles | typeof pages | typeof categories | typeof tags | typeof authors | typeof media
/** Tabel dengan slug unik per site. */
type SluggedTable = typeof articles | typeof pages | typeof categories | typeof tags

// ---------- Bentuk data untuk admin -----------------------------------------

export interface ArticleListItem {
  id: string
  title: string
  slug: string
  status: string
  isFeatured: boolean
  publishedAt: Date | null
  updatedAt: Date
  version: number
  category: { id: string; name: string }
  author: { id: string; name: string } | null
}

export interface AdminArticleQuery {
  page?: number
  pageSize?: number
  status?: string
  /** Cari di judul (tidak peka huruf besar). */
  q?: string
}

export interface ArticleRecord {
  id: string
  title: string
  slug: string
  excerpt: string | null
  body: Body
  categoryId: string
  authorId: string | null
  featuredMediaId: string | null
  format: string
  status: string
  isFeatured: boolean
  publishedAt: Date | null
  tagIds: string[]
  seo: ContentSeo
  attributes: Record<string, unknown>
  version: number
  createdAt: Date
  updatedAt: Date
  /** Path publik saat ini (pola permalink site); null bila belum tampil publik. */
  publicPath: string | null
}

export interface MediaListItem {
  id: string
  storageKey: string
  mimeType: string
  sizeBytes: number
  width: number | null
  height: number | null
  altText: string | null
  caption: string | null
  credit: string | null
  focalX: number
  focalY: number
  createdAt: Date
  updatedAt: Date
}

/** File yang sudah disimpan storage, siap dicatat (dari endpoint upload, bukan input bebas). */
export interface NewMediaFile {
  storageKey: string
  mimeType: string
  sizeBytes: number
  width: number
  height: number
}

export interface RevisionItem {
  revisionNo: number
  changeNote: string | null
  createdAt: Date
  createdBy: string | null
}

export interface PageRecord {
  id: string
  title: string
  slug: string
  body: Body
  viewKey: string
  status: string
  publishedAt: Date | null
  seo: ContentSeo
  updatedAt: Date
}

export interface CategoryRecord {
  id: string
  name: string
  slug: string
  parentId: string | null
  description: string | null
  sortOrder: number
  status: string
  seo: ContentSeo
  updatedAt: Date
}

export interface TagRecord {
  id: string
  name: string
  slug: string
  updatedAt: Date
}

export interface MenuItemRecord {
  id: string
  label: string
  parentId: string | null
  type: MenuItemInput['type']
  targetId: string | null
  url: string | null
  openInNewTab: boolean
  sortOrder: number
  isActive: boolean
  updatedAt: Date
}

export interface MenuRecord {
  id: string
  location: string
  name: string
  items: MenuItemRecord[]
}

// ---------- Util -------------------------------------------------------------

/** Validasi Zod -> EditorError('invalid') dengan issue per field. */
function parse<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const result = schema.safeParse(raw, { error: editorErrorMap })
  if (result.success) return result.data
  throw invalid(result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })))
}

/** Kolom timestamp dibandingkan pada presisi milidetik (Date JavaScript), bukan mikrodetik PostgreSQL. */
function sameMillis(column: PgColumn, iso: string): SQL {
  return sql`date_trunc('milliseconds', ${column}) = ${new Date(iso).toISOString()}::timestamptz`
}

const VISIBLE = (status: string, publishedAt: Date | null, now: Date) =>
  status === 'PUBLISHED' && publishedAt !== null && publishedAt <= now

export function createEditorRepository(ctx: RepositoryContext) {
  const { db } = ctx

  async function siteSettings(tx: Db, siteId: SiteId) {
    const [row] = await tx.select({ settings: sites.settings, timezone: sites.timezone }).from(sites).where(eq(sites.id, siteId)).limit(1)
    if (!row) throw notFound('Site')
    const settings = parseSiteSettings(row.settings)
    return { settings, urls: createUrlBuilder({ permalink: settings.permalink, timeZone: row.timezone }) }
  }

  /** Semua id harus ada di tabel itu dan milik site; selain itu invalid di field tersebut. */
  async function ensureOwned(tx: Db, table: OwnedTable, siteId: SiteId, ids: (string | null)[], field: string, label: string) {
    const wanted = [...new Set(ids.filter((v): v is string => Boolean(v)))]
    if (wanted.length === 0) return
    const rows = await tx.select({ id: table.id }).from(table).where(and(eq(table.siteId, siteId), inArray(table.id, wanted)))
    const found = new Set(rows.map((r) => r.id))
    const missing = wanted.filter((v) => !found.has(v))
    if (missing.length) throw invalid([{ field, message: `${label} tidak ditemukan di site ini: ${missing.join(', ')}` }])
  }

  /** Slug unik per site: slug diminta dipakai apa adanya (bentrok = invalid); kosong = dari judul + akhiran. */
  async function uniqueSlug(
    tx: Db,
    table: SluggedTable,
    siteId: SiteId,
    requested: string | undefined,
    source: string,
    excludeId: string | null,
    reservedFirst: boolean,
  ): Promise<string> {
    const taken = async (candidate: string) => {
      const conditions = [eq(table.siteId, siteId), eq(table.slug, candidate)]
      if (excludeId) conditions.push(ne(table.id, excludeId))
      const [row] = await tx.select({ id: table.id }).from(table).where(and(...conditions)).limit(1)
      return Boolean(row)
    }
    if (requested) {
      if (reservedFirst && isReservedFirstSegment(requested)) throw invalid([{ field: 'slug', message: `"${requested}" dipakai route sistem` }])
      if (await taken(requested)) throw invalid([{ field: 'slug', message: `slug "${requested}" sudah dipakai` }])
      return requested
    }
    const base = slugify(source) || 'tanpa-judul'
    for (let attempt = 1; attempt < 100; attempt++) {
      const candidate = slugCandidate(base, attempt)
      if (reservedFirst && isReservedFirstSegment(candidate)) continue
      if (!(await taken(candidate))) return candidate
    }
    throw invalid([{ field: 'slug', message: 'tidak menemukan slug yang belum dipakai; isi slug sendiri' }])
  }

  /** Redirect lama -> baru, rantai diratakan; dipanggil hanya saat path publik berubah. */
  async function moveRedirects(tx: Db, siteId: SiteId, fromPath: string, toPath: string) {
    if (fromPath === toPath) return
    // Path baru kini berisi konten: redirect yang berangkat dari sana tidak berlaku lagi.
    await tx.delete(redirects).where(and(eq(redirects.siteId, siteId), eq(redirects.fromPath, toPath)))
    // Rantai A -> fromPath menjadi A -> toPath (tanpa 301 berantai); yang jadi menunjuk dirinya dihapus.
    await tx.update(redirects).set({ toPath, updatedAt: sql`now()` }).where(and(eq(redirects.siteId, siteId), eq(redirects.toPath, fromPath), ne(redirects.fromPath, toPath)))
    await tx
      .insert(redirects)
      .values({ siteId, fromPath, toPath, statusCode: 301 })
      .onConflictDoUpdate({ target: [redirects.siteId, redirects.fromPath], set: { toPath, statusCode: 301, updatedAt: sql`now()` } })
  }

  // ---------- Artikel --------------------------------------------------------

  async function articleCategorySlug(tx: Db, siteId: SiteId, categoryId: string) {
    const [row] = await tx.select({ slug: categories.slug }).from(categories).where(and(eq(categories.siteId, siteId), eq(categories.id, categoryId))).limit(1)
    return row?.slug ?? null
  }

  async function checkArticleRefs(tx: Db, siteId: SiteId, input: ArticleInput) {
    await ensureOwned(tx, categories, siteId, [input.categoryId], 'categoryId', 'kategori')
    await ensureOwned(tx, authors, siteId, [input.authorId], 'authorId', 'penulis')
    await ensureOwned(tx, media, siteId, [input.featuredMediaId], 'featuredMediaId', 'media')
    await ensureOwned(tx, media, siteId, [input.seo.og_image_id ?? null], 'seo.og_image_id', 'media')
    await ensureOwned(tx, tags, siteId, input.tagIds, 'tagIds', 'tag')
    const imageIds = input.body.blocks.flatMap((b) => (b.type === 'image' ? [b.mediaId] : []))
    await ensureOwned(tx, media, siteId, imageIds, 'body', 'media gambar')
  }

  function snapshotOf(input: ArticleInput & { slug: string }) {
    return {
      title: input.title, slug: input.slug, excerpt: input.excerpt, body: input.body,
      category_id: input.categoryId, author_id: input.authorId, featured_media_id: input.featuredMediaId,
      format: input.format, status: input.status, is_featured: input.isFeatured,
      published_at: input.publishedAt?.toISOString() ?? null, seo: input.seo, attributes: input.attributes, tag_ids: input.tagIds,
    }
  }

  async function writeTags(tx: Db, siteId: SiteId, articleId: string, tagIds: string[]) {
    await tx.delete(articleTags).where(and(eq(articleTags.siteId, siteId), eq(articleTags.articleId, articleId)))
    const unique = [...new Set(tagIds)]
    if (unique.length) await tx.insert(articleTags).values(unique.map((tagId, i) => ({ siteId, articleId, tagId, sortOrder: i })))
  }

  /**
   * Tanggal terbit yang disimpan: field tidak dikirim = tanggal lama; null =
   * dikosongkan. PUBLISHED tanpa tanggal = sekarang.
   */
  function effectivePublishedAt(input: { status: string; publishedAt?: Date | null }, previous: Date | null): Date | null {
    const chosen = input.publishedAt === undefined ? previous : input.publishedAt
    return input.status === 'PUBLISHED' ? (chosen ?? ctx.now()) : chosen
  }

  async function articlePath(tx: Db, siteId: SiteId, a: { slug: string; categoryId: string; publishedAt: Date | null; status: string }) {
    if (!VISIBLE(a.status, a.publishedAt, ctx.now())) return null
    const { urls } = await siteSettings(tx, siteId)
    const categorySlug = await articleCategorySlug(tx, siteId, a.categoryId)
    return categorySlug && a.publishedAt ? urls.article({ slug: a.slug, categorySlug, publishedAt: a.publishedAt }) : null
  }

  async function loadArticle(tx: Db, siteId: SiteId, id: string): Promise<ArticleRecord> {
    const [row] = await tx.select().from(articles).where(and(eq(articles.siteId, siteId), eq(articles.id, id))).limit(1)
    if (!row) throw notFound('Artikel')
    const tagRows = await tx.select({ tagId: articleTags.tagId }).from(articleTags).where(and(eq(articleTags.siteId, siteId), eq(articleTags.articleId, id))).orderBy(asc(articleTags.sortOrder))
    const record = {
      id: row.id, title: row.title, slug: row.slug, excerpt: row.excerpt, body: row.body as Body,
      categoryId: row.categoryId, authorId: row.authorId, featuredMediaId: row.featuredMediaId, format: row.format,
      status: row.status, isFeatured: row.isFeatured, publishedAt: row.publishedAt, tagIds: tagRows.map((t) => t.tagId),
      seo: row.seo as ContentSeo, attributes: row.attributes as Record<string, unknown>, version: row.version,
      createdAt: row.createdAt, updatedAt: row.updatedAt,
    }
    return { ...record, publicPath: await articlePath(tx, siteId, record) }
  }

  async function articleReservedFirst(tx: Db, siteId: SiteId) {
    const { settings } = await siteSettings(tx, siteId)
    return permalinkFirstToken(settings.permalink) === ':slug'
  }

  // ---------- Halaman, kategori, tag, menu (util kecil) ---------------------

  async function checkPageRefs(tx: Db, siteId: SiteId, input: { seo: ContentSeo; body: Body }) {
    await ensureOwned(tx, media, siteId, [input.seo.og_image_id ?? null], 'seo.og_image_id', 'media')
    await ensureOwned(tx, media, siteId, input.body.blocks.flatMap((b) => (b.type === 'image' ? [b.mediaId] : [])), 'body', 'media gambar')
  }

  async function guardedUpdate<T>(
    rawRun: () => Promise<T[]>,
    exists: () => Promise<boolean>,
    what: string,
  ): Promise<T> {
    const [row] = await withSlugConflict(rawRun)
    if (row) return row
    throw (await exists()) ? conflict(what) : notFound(what)
  }

  async function categoryDepthOk(tx: Db, siteId: SiteId, id: string | null, parentId: string | null) {
    // Induk tidak boleh dirinya atau turunannya (mencegah siklus).
    let current = parentId
    for (let depth = 0; current; depth++) {
      if (current === id) throw invalid([{ field: 'parentId', message: 'induk tidak boleh kategori itu sendiri atau turunannya' }])
      if (depth > 50) throw invalid([{ field: 'parentId', message: 'kategori terlalu dalam' }])
      const [row] = await tx.select({ parentId: categories.parentId }).from(categories).where(and(eq(categories.siteId, siteId), eq(categories.id, current))).limit(1)
      if (!row) throw invalid([{ field: 'parentId', message: 'kategori induk tidak ditemukan di site ini' }])
      current = row.parentId
    }
  }

  const TARGET_TABLE = { CATEGORY: categories, ARTICLE: articles, PAGE: pages, TAG: tags } as const

  async function checkMenuItem(tx: Db, siteId: SiteId, menuId: string, itemId: string | null, input: MenuItemInput) {
    if (input.type !== 'URL' && input.type !== 'ROUTE') {
      await ensureOwned(tx, TARGET_TABLE[input.type], siteId, [input.targetId], 'targetId', 'target menu')
    }
    let current = input.parentId
    for (let depth = 0; current; depth++) {
      if (current === itemId) throw invalid([{ field: 'parentId', message: 'induk tidak boleh item itu sendiri atau turunannya' }])
      if (depth > 10) throw invalid([{ field: 'parentId', message: 'menu terlalu dalam' }])
      const [row] = await tx.select({ parentId: menuItems.parentId }).from(menuItems).where(and(eq(menuItems.siteId, siteId), eq(menuItems.menuId, menuId), eq(menuItems.id, current))).limit(1)
      if (!row) throw invalid([{ field: 'parentId', message: 'item induk tidak ada di menu ini' }])
      current = row.parentId
    }
  }

  function menuItemValues(input: MenuItemInput) {
    const target = input.targetId
    return {
      label: input.label, parentId: input.parentId, itemType: input.type,
      categoryId: input.type === 'CATEGORY' ? target : null,
      articleId: input.type === 'ARTICLE' ? target : null,
      pageId: input.type === 'PAGE' ? target : null,
      tagId: input.type === 'TAG' ? target : null,
      url: input.url, openInNewTab: input.openInNewTab, sortOrder: input.sortOrder, isActive: input.isActive,
    }
  }

  function toMenuItem(row: typeof menuItems.$inferSelect): MenuItemRecord {
    return {
      id: row.id, label: row.label, parentId: row.parentId, type: row.itemType as MenuItemInput['type'],
      targetId: row.categoryId ?? row.articleId ?? row.pageId ?? row.tagId ?? null,
      url: row.url, openInNewTab: row.openInNewTab, sortOrder: row.sortOrder, isActive: row.isActive, updatedAt: row.updatedAt,
    }
  }

  async function menuOf(tx: Db, siteId: SiteId, location: string) {
    const [menu] = await tx.select({ id: menus.id, location: menus.location, name: menus.name }).from(menus).where(and(eq(menus.siteId, siteId), eq(menus.location, location))).limit(1)
    if (!menu) throw notFound(`Menu ${location}`)
    return menu
  }

  const api = {
    // ======================= Pilihan untuk form =======================

    /** Penulis untuk pilihan di form artikel (termasuk HIDDEN, ditandai). */
    async listAuthors(siteId: SiteId): Promise<{ id: string; name: string; status: string }[]> {
      return db.select({ id: authors.id, name: authors.name, status: authors.status }).from(authors).where(eq(authors.siteId, siteId)).orderBy(asc(authors.name))
    },

    /**
     * Media site, terbaru dulu, untuk pemilih gambar (upload menyusul di 4.3).
     * `ids`: hanya media itu (mis. yang sedang terpasang tetapi di luar halaman pertama).
     */
    async listMedia(siteId: SiteId, query: { page?: number; pageSize?: number; ids?: string[] } = {}): Promise<Page<MediaListItem>> {
      const paging = normalizePaging({ page: query.page, pageSize: query.pageSize ?? 30 })
      const ids = (query.ids ?? []).filter((v) => UUID.test(v)).slice(0, 50)
      const where = query.ids ? and(eq(media.siteId, siteId), inArray(media.id, ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])) : eq(media.siteId, siteId)
      const [total] = await db.select({ n: count() }).from(media).where(where)
      const rows = await db
        .select(mediaListColumns)
        .from(media)
        .where(where)
        .orderBy(desc(media.createdAt), desc(media.id))
        .limit(paging.pageSize)
        .offset(paging.offset)
      return toPage(rows, total?.n ?? 0, paging.page, paging.pageSize)
    },

    // ======================= Media =======================

    /**
     * Catat file yang baru disimpan storage. storage_key wajib diawali kode
     * site ini (dibuat server, bukan dari nama file pengguna).
     */
    async createMedia(siteId: SiteId, file: NewMediaFile, raw: unknown, userId: string | null): Promise<MediaListItem> {
      const meta = parse(mediaMetaSchema, raw)
      const [site] = await db.select({ code: sites.code }).from(sites).where(eq(sites.id, siteId)).limit(1)
      if (!site) throw notFound('Site')
      if (!file.storageKey.startsWith(`${site.code}/`)) throw new Error(`storage_key ${file.storageKey} bukan milik site ${site.code}`)
      const [row] = await db
        .insert(media)
        .values({ siteId, ...file, altText: meta.altText, caption: meta.caption, credit: meta.credit, focalX: meta.focalX, focalY: meta.focalY, createdBy: userId })
        .returning(mediaListColumns)
      if (!row) throw new Error('insert media tidak mengembalikan baris')
      return row
    },

    async updateMedia(siteId: SiteId, id: string, raw: unknown, expectedUpdatedAt: string): Promise<MediaListItem> {
      const mediaId = asId(id, 'Media')
      const token = parse(updatedAtSchema, expectedUpdatedAt)
      const meta = parse(mediaMetaSchema, raw)
      return guardedUpdate(
        () => db.update(media).set({ ...meta, updatedAt: sql`now()` })
          .where(and(eq(media.siteId, siteId), eq(media.id, mediaId), sameMillis(media.updatedAt, token))).returning(mediaListColumns),
        async () => Boolean((await db.select({ id: media.id }).from(media).where(and(eq(media.siteId, siteId), eq(media.id, mediaId))).limit(1))[0]),
        'Media',
      )
    },

    /** Tempat media dipakai; kosong = boleh dihapus. */
    async mediaUsage(siteId: SiteId, id: string): Promise<string[]> {
      const mediaId = asId(id, 'Media')
      const imageBlock = JSON.stringify([{ type: 'image', mediaId }])
      const [articleRows, pageRows, categoryRows, authorRows, siteRows] = await Promise.all([
        db.select({ title: articles.title }).from(articles).where(and(eq(articles.siteId, siteId), or(
          eq(articles.featuredMediaId, mediaId),
          sql`${articles.seo}->>'og_image_id' = ${mediaId}`,
          sql`${articles.body}->'blocks' @> ${imageBlock}::jsonb`,
        ))).limit(20),
        db.select({ title: pages.title }).from(pages).where(and(eq(pages.siteId, siteId), or(
          sql`${pages.seo}->>'og_image_id' = ${mediaId}`,
          sql`${pages.body}->'blocks' @> ${imageBlock}::jsonb`,
        ))).limit(20),
        db.select({ name: categories.name }).from(categories).where(and(eq(categories.siteId, siteId), sql`${categories.seo}->>'og_image_id' = ${mediaId}`)).limit(20),
        db.select({ name: authors.name }).from(authors).where(and(eq(authors.siteId, siteId), eq(authors.avatarMediaId, mediaId))).limit(20),
        db.select({ name: sites.name }).from(sites).where(and(eq(sites.id, siteId), or(eq(sites.logoMediaId, mediaId), eq(sites.faviconMediaId, mediaId)))),
      ])
      return [
        ...articleRows.map((r) => `artikel "${r.title}"`),
        ...pageRows.map((r) => `halaman "${r.title}"`),
        ...categoryRows.map((r) => `kategori "${r.name}"`),
        ...authorRows.map((r) => `avatar penulis ${r.name}`),
        ...siteRows.map(() => 'logo/favicon site'),
      ]
    },

    /**
     * Hapus catatan media yang tidak dipakai di mana pun; mengembalikan
     * storage_key agar file-nya dihapus pemanggil. Dipakai = invalid.
     */
    async deleteMedia(siteId: SiteId, id: string, expectedUpdatedAt: string): Promise<{ storageKey: string }> {
      const mediaId = asId(id, 'Media')
      const token = parse(updatedAtSchema, expectedUpdatedAt)
      const usage = await api.mediaUsage(siteId, mediaId)
      if (usage.length) throw invalid([{ field: '', message: `media masih dipakai: ${usage.join(', ')}` }])
      return guardedUpdate(
        () => db.delete(media).where(and(eq(media.siteId, siteId), eq(media.id, mediaId), sameMillis(media.updatedAt, token))).returning({ storageKey: media.storageKey }),
        async () => Boolean((await db.select({ id: media.id }).from(media).where(and(eq(media.siteId, siteId), eq(media.id, mediaId))).limit(1))[0]),
        'Media',
      )
    },

    // ======================= Artikel =======================

    async listArticles(siteId: SiteId, query: AdminArticleQuery = {}): Promise<Page<ArticleListItem>> {
      const paging = normalizePaging({ page: query.page, pageSize: query.pageSize ?? 20 })
      const conditions: SQL[] = [eq(articles.siteId, siteId)]
      if (query.status) conditions.push(eq(articles.status, query.status))
      const q = query.q?.trim().slice(0, 200)
      if (q) conditions.push(sql`${articles.title} ILIKE ${`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`}`)
      const where = and(...conditions)
      const [total] = await db.select({ n: count() }).from(articles).where(where)
      const rows = await db
        .select({
          id: articles.id, title: articles.title, slug: articles.slug, status: articles.status, isFeatured: articles.isFeatured,
          publishedAt: articles.publishedAt, updatedAt: articles.updatedAt, version: articles.version,
          categoryId: categories.id, categoryName: categories.name, authorId: authors.id, authorName: authors.name,
        })
        .from(articles)
        .innerJoin(categories, and(eq(categories.siteId, articles.siteId), eq(categories.id, articles.categoryId)))
        .leftJoin(authors, and(eq(authors.siteId, articles.siteId), eq(authors.id, articles.authorId)))
        .where(where)
        .orderBy(desc(articles.updatedAt), desc(articles.id))
        .limit(paging.pageSize)
        .offset(paging.offset)
      const items = rows.map((r) => ({
        id: r.id, title: r.title, slug: r.slug, status: r.status, isFeatured: r.isFeatured, publishedAt: r.publishedAt,
        updatedAt: r.updatedAt, version: r.version, category: { id: r.categoryId, name: r.categoryName },
        author: r.authorId && r.authorName ? { id: r.authorId, name: r.authorName } : null,
      }))
      return toPage(items, total?.n ?? 0, paging.page, paging.pageSize)
    },

    async getArticle(siteId: SiteId, id: string): Promise<ArticleRecord> {
      return loadArticle(db, siteId, asId(id, 'Artikel'))
    },

    async listRevisions(siteId: SiteId, articleId: string): Promise<RevisionItem[]> {
      await loadArticle(db, siteId, asId(articleId, 'Artikel'))
      return db
        .select({ revisionNo: articleRevisions.revisionNo, changeNote: articleRevisions.changeNote, createdAt: articleRevisions.createdAt, createdBy: articleRevisions.createdBy })
        .from(articleRevisions)
        .where(and(eq(articleRevisions.siteId, siteId), eq(articleRevisions.articleId, articleId)))
        .orderBy(desc(articleRevisions.revisionNo))
    },

    async createArticle(siteId: SiteId, raw: unknown, userId: string | null): Promise<ArticleRecord> {
      const input = parse(articleInputSchema, raw)
      return db.transaction(async (tx) => {
        await checkArticleRefs(tx, siteId, input)
        const slug = await uniqueSlug(tx, articles, siteId, input.slug, input.title, null, await articleReservedFirst(tx, siteId))
        const publishedAt = effectivePublishedAt(input, null)
        const [row] = await withSlugConflict(() => tx
          .insert(articles)
          .values({
            siteId, categoryId: input.categoryId, authorId: input.authorId, featuredMediaId: input.featuredMediaId,
            title: input.title, slug, excerpt: input.excerpt, body: input.body, bodyText: extractBodyText(input.body),
            format: input.format, status: input.status, isFeatured: input.isFeatured, publishedAt, seo: input.seo,
            attributes: input.attributes, version: 1, createdBy: userId, updatedBy: userId,
          })
          .returning({ id: articles.id }))
        if (!row) throw new Error('insert artikel tidak mengembalikan baris')
        await writeTags(tx, siteId, row.id, input.tagIds)
        await tx.insert(articleRevisions).values({ siteId, articleId: row.id, revisionNo: 1, snapshot: snapshotOf({ ...input, slug, publishedAt }), changeNote: 'Dibuat', createdBy: userId })
        return loadArticle(tx, siteId, row.id)
      })
    },

    /** Simpan seluruh isi artikel; expectedVersion = version yang dibaca saat form dibuka. */
    async updateArticle(siteId: SiteId, id: string, raw: unknown, expectedVersion: number, userId: string | null, changeNote?: string): Promise<ArticleRecord> {
      const articleId = asId(id, 'Artikel')
      const version = parse(versionSchema, expectedVersion)
      const input = parse(articleInputSchema, raw)
      return db.transaction(async (tx) => {
        const before = await loadArticle(tx, siteId, articleId)
        if (before.version !== version) throw conflict('Artikel')
        await checkArticleRefs(tx, siteId, input)
        const slug = await uniqueSlug(tx, articles, siteId, input.slug ?? before.slug, input.title, articleId, await articleReservedFirst(tx, siteId))
        const publishedAt = effectivePublishedAt(input, before.publishedAt)
        const [row] = await withSlugConflict(() => tx
          .update(articles)
          .set({
            categoryId: input.categoryId, authorId: input.authorId, featuredMediaId: input.featuredMediaId,
            title: input.title, slug, excerpt: input.excerpt, body: input.body, bodyText: extractBodyText(input.body),
            format: input.format, status: input.status, isFeatured: input.isFeatured, publishedAt, seo: input.seo,
            attributes: input.attributes, version: version + 1, updatedBy: userId, updatedAt: sql`now()`,
          })
          .where(and(eq(articles.siteId, siteId), eq(articles.id, articleId), eq(articles.version, version)))
          .returning({ id: articles.id }))
        if (!row) throw conflict('Artikel')
        await writeTags(tx, siteId, articleId, input.tagIds)
        await tx.insert(articleRevisions).values({
          siteId, articleId, revisionNo: version + 1, snapshot: snapshotOf({ ...input, slug, publishedAt }),
          changeNote: changeNote?.trim().slice(0, 500) || null, createdBy: userId,
        })
        const after = await loadArticle(tx, siteId, articleId)
        // URL publik berubah (slug, kategori, atau tanggal di permalink) -> redirect dari URL lama.
        if (before.publicPath && after.publicPath && before.publicPath !== after.publicPath) {
          await moveRedirects(tx, siteId, before.publicPath, after.publicPath)
        }
        return after
      })
    },

    /** Arsipkan: status ARCHIVED (tidak tampil publik), dengan revisi baru. */
    /**
     * Arsipkan: hanya status (ARCHIVED, tidak tampil publik), versi, dan
     * revisi. Isi tidak divalidasi ulang, agar artikel lama dengan data yang
     * tidak lolos aturan tulis terbaru tetap bisa disembunyikan.
     */
    async archiveArticle(siteId: SiteId, id: string, expectedVersion: number, userId: string | null): Promise<ArticleRecord> {
      const articleId = asId(id, 'Artikel')
      const version = parse(versionSchema, expectedVersion)
      return db.transaction(async (tx) => {
        const a = await loadArticle(tx, siteId, articleId)
        const [row] = await tx
          .update(articles)
          .set({ status: 'ARCHIVED', version: version + 1, updatedBy: userId, updatedAt: sql`now()` })
          .where(and(eq(articles.siteId, siteId), eq(articles.id, articleId), eq(articles.version, version)))
          .returning({ id: articles.id })
        if (!row) throw conflict('Artikel')
        const snapshot = {
          title: a.title, slug: a.slug, excerpt: a.excerpt, body: a.body, category_id: a.categoryId, author_id: a.authorId,
          featured_media_id: a.featuredMediaId, format: a.format, status: 'ARCHIVED', is_featured: a.isFeatured,
          published_at: a.publishedAt?.toISOString() ?? null, seo: a.seo, attributes: a.attributes, tag_ids: a.tagIds,
        }
        await tx.insert(articleRevisions).values({ siteId, articleId, revisionNo: version + 1, snapshot, changeNote: 'Diarsipkan', createdBy: userId })
        return loadArticle(tx, siteId, articleId)
      })
    },

    // ======================= Halaman =======================

    async listPages(siteId: SiteId): Promise<PageRecord[]> {
      const rows = await db.select().from(pages).where(eq(pages.siteId, siteId)).orderBy(asc(pages.title))
      return rows.map((r) => ({ id: r.id, title: r.title, slug: r.slug, body: r.body as Body, viewKey: r.viewKey, status: r.status, publishedAt: r.publishedAt, seo: r.seo as ContentSeo, updatedAt: r.updatedAt }))
    },

    async createPage(siteId: SiteId, raw: unknown): Promise<PageRecord> {
      const input = parse(pageInputSchema, raw)
      return db.transaction(async (tx) => {
        await checkPageRefs(tx, siteId, input)
        const slug = await uniqueSlug(tx, pages, siteId, input.slug, input.title, null, false)
        const publishedAt = effectivePublishedAt(input, null)
        const [row] = await withSlugConflict(() => tx.insert(pages).values({ siteId, title: input.title, slug, body: input.body, viewKey: input.viewKey, status: input.status, publishedAt, seo: input.seo }).returning())
        if (!row) throw new Error('insert halaman tidak mengembalikan baris')
        return { id: row.id, title: row.title, slug: row.slug, body: row.body as Body, viewKey: row.viewKey, status: row.status, publishedAt: row.publishedAt, seo: row.seo as ContentSeo, updatedAt: row.updatedAt }
      })
    },

    async updatePage(siteId: SiteId, id: string, raw: unknown, expectedUpdatedAt: string): Promise<PageRecord> {
      const pageId = asId(id, 'Halaman')
      const token = parse(updatedAtSchema, expectedUpdatedAt)
      const input = parse(pageInputSchema, raw)
      return db.transaction(async (tx) => {
        const [before] = await tx.select().from(pages).where(and(eq(pages.siteId, siteId), eq(pages.id, pageId))).limit(1)
        if (!before) throw notFound('Halaman')
        await checkPageRefs(tx, siteId, input)
        const slug = await uniqueSlug(tx, pages, siteId, input.slug ?? before.slug, input.title, pageId, false)
        const publishedAt = effectivePublishedAt(input, before.publishedAt)
        const row = await guardedUpdate(
          () => tx.update(pages).set({ title: input.title, slug, body: input.body, viewKey: input.viewKey, status: input.status, publishedAt, seo: input.seo, updatedAt: sql`now()` })
            .where(and(eq(pages.siteId, siteId), eq(pages.id, pageId), sameMillis(pages.updatedAt, token))).returning(),
          async () => true,
          'Halaman',
        )
        const wasVisible = VISIBLE(before.status, before.publishedAt, ctx.now())
        const isVisible = VISIBLE(row.status, row.publishedAt, ctx.now())
        if (wasVisible && isVisible && before.slug !== row.slug) {
          const { urls } = await siteSettings(tx, siteId)
          await moveRedirects(tx, siteId, urls.page(before.slug), urls.page(row.slug))
        }
        return { id: row.id, title: row.title, slug: row.slug, body: row.body as Body, viewKey: row.viewKey, status: row.status, publishedAt: row.publishedAt, seo: row.seo as ContentSeo, updatedAt: row.updatedAt }
      })
    },

    // ======================= Kategori =======================

    async listCategories(siteId: SiteId): Promise<CategoryRecord[]> {
      const rows = await db.select().from(categories).where(eq(categories.siteId, siteId)).orderBy(asc(categories.sortOrder), asc(categories.name))
      return rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug, parentId: r.parentId, description: r.description, sortOrder: r.sortOrder, status: r.status, seo: r.seo as ContentSeo, updatedAt: r.updatedAt }))
    },

    async createCategory(siteId: SiteId, raw: unknown): Promise<CategoryRecord> {
      const input = parse(categoryInputSchema, raw)
      return db.transaction(async (tx) => {
        await categoryDepthOk(tx, siteId, null, input.parentId)
        await ensureOwned(tx, media, siteId, [input.seo.og_image_id ?? null], 'seo.og_image_id', 'media')
        const { settings } = await siteSettings(tx, siteId)
        const slug = await uniqueSlug(tx, categories, siteId, input.slug, input.name, null, permalinkFirstToken(settings.permalink) === ':category')
        const [row] = await withSlugConflict(() => tx.insert(categories).values({ siteId, name: input.name, slug, parentId: input.parentId, description: input.description, sortOrder: input.sortOrder, seo: input.seo }).returning())
        if (!row) throw new Error('insert kategori tidak mengembalikan baris')
        return { id: row.id, name: row.name, slug: row.slug, parentId: row.parentId, description: row.description, sortOrder: row.sortOrder, status: row.status, seo: row.seo as ContentSeo, updatedAt: row.updatedAt }
      })
    },

    /** status ACTIVE/HIDDEN ikut diubah lewat field terpisah agar form biasa tidak menyembunyikan kategori tanpa sengaja. */
    async updateCategory(siteId: SiteId, id: string, raw: unknown, expectedUpdatedAt: string, status?: 'ACTIVE' | 'HIDDEN'): Promise<CategoryRecord> {
      const categoryId = asId(id, 'Kategori')
      const token = parse(updatedAtSchema, expectedUpdatedAt)
      const input = parse(categoryInputSchema, raw)
      return db.transaction(async (tx) => {
        const [before] = await tx.select().from(categories).where(and(eq(categories.siteId, siteId), eq(categories.id, categoryId))).limit(1)
        if (!before) throw notFound('Kategori')
        await categoryDepthOk(tx, siteId, categoryId, input.parentId)
        await ensureOwned(tx, media, siteId, [input.seo.og_image_id ?? null], 'seo.og_image_id', 'media')
        const { settings, urls } = await siteSettings(tx, siteId)
        const slug = await uniqueSlug(tx, categories, siteId, input.slug ?? before.slug, input.name, categoryId, permalinkFirstToken(settings.permalink) === ':category')
        const row = await guardedUpdate(
          () => tx.update(categories).set({ name: input.name, slug, parentId: input.parentId, description: input.description, sortOrder: input.sortOrder, seo: input.seo, status: status ?? before.status, updatedAt: sql`now()` })
            .where(and(eq(categories.siteId, siteId), eq(categories.id, categoryId), sameMillis(categories.updatedAt, token))).returning(),
          async () => true,
          'Kategori',
        )
        // URL kategori berubah -> redirect halaman kategori. Artikel di dalamnya
        // tidak perlu: path artikel lama dialihkan ke permalink kanonik oleh route publik.
        if (before.status === 'ACTIVE' && row.status === 'ACTIVE' && before.slug !== row.slug) {
          await moveRedirects(tx, siteId, urls.category(before.slug), urls.category(row.slug))
        }
        return { id: row.id, name: row.name, slug: row.slug, parentId: row.parentId, description: row.description, sortOrder: row.sortOrder, status: row.status, seo: row.seo as ContentSeo, updatedAt: row.updatedAt }
      })
    },

    // ======================= Tag =======================

    async listTags(siteId: SiteId): Promise<TagRecord[]> {
      return db.select({ id: tags.id, name: tags.name, slug: tags.slug, updatedAt: tags.updatedAt }).from(tags).where(eq(tags.siteId, siteId)).orderBy(asc(tags.name))
    },

    async createTag(siteId: SiteId, raw: unknown): Promise<TagRecord> {
      const input = parse(tagInputSchema, raw)
      return db.transaction(async (tx) => {
        const slug = await uniqueSlug(tx, tags, siteId, input.slug, input.name, null, false)
        const [row] = await withSlugConflict(() => tx.insert(tags).values({ siteId, name: input.name, slug }).returning({ id: tags.id, name: tags.name, slug: tags.slug, updatedAt: tags.updatedAt }))
        if (!row) throw new Error('insert tag tidak mengembalikan baris')
        return row
      })
    },

    async updateTag(siteId: SiteId, id: string, raw: unknown, expectedUpdatedAt: string): Promise<TagRecord> {
      const tagId = asId(id, 'Tag')
      const token = parse(updatedAtSchema, expectedUpdatedAt)
      const input = parse(tagInputSchema, raw)
      return db.transaction(async (tx) => {
        const [before] = await tx.select({ slug: tags.slug }).from(tags).where(and(eq(tags.siteId, siteId), eq(tags.id, tagId))).limit(1)
        if (!before) throw notFound('Tag')
        const slug = await uniqueSlug(tx, tags, siteId, input.slug ?? before.slug, input.name, tagId, false)
        const row = await guardedUpdate(
          () => tx.update(tags).set({ name: input.name, slug, updatedAt: sql`now()` })
            .where(and(eq(tags.siteId, siteId), eq(tags.id, tagId), sameMillis(tags.updatedAt, token)))
            .returning({ id: tags.id, name: tags.name, slug: tags.slug, updatedAt: tags.updatedAt }),
          async () => true,
          'Tag',
        )
        if (before.slug !== row.slug) {
          const { urls } = await siteSettings(tx, siteId)
          await moveRedirects(tx, siteId, urls.tag(before.slug), urls.tag(row.slug))
        }
        return row
      })
    },

    /** Hapus tag: lepas dari semua artikel dan item menu yang menunjuknya (CASCADE). */
    async deleteTag(siteId: SiteId, id: string, expectedUpdatedAt: string): Promise<void> {
      const tagId = asId(id, 'Tag')
      const token = parse(updatedAtSchema, expectedUpdatedAt)
      await guardedUpdate(
        () => db.delete(tags).where(and(eq(tags.siteId, siteId), eq(tags.id, tagId), sameMillis(tags.updatedAt, token))).returning({ id: tags.id }),
        async () => Boolean((await db.select({ id: tags.id }).from(tags).where(and(eq(tags.siteId, siteId), eq(tags.id, tagId))).limit(1))[0]),
        'Tag',
      )
    },

    // ======================= Menu =======================

    async getMenu(siteId: SiteId, location: string): Promise<MenuRecord> {
      const menu = await menuOf(db, siteId, location)
      const rows = await db.select().from(menuItems).where(and(eq(menuItems.siteId, siteId), eq(menuItems.menuId, menu.id))).orderBy(asc(menuItems.sortOrder), asc(menuItems.label))
      return { ...menu, items: rows.map(toMenuItem) }
    },

    async createMenuItem(siteId: SiteId, location: string, raw: unknown): Promise<MenuItemRecord> {
      const input = parse(menuItemInputSchema, raw)
      return db.transaction(async (tx) => {
        const menu = await menuOf(tx, siteId, location)
        await checkMenuItem(tx, siteId, menu.id, null, input)
        const [row] = await tx.insert(menuItems).values({ siteId, menuId: menu.id, ...menuItemValues(input) }).returning()
        if (!row) throw new Error('insert item menu tidak mengembalikan baris')
        return toMenuItem(row)
      })
    },

    async updateMenuItem(siteId: SiteId, location: string, id: string, raw: unknown, expectedUpdatedAt: string): Promise<MenuItemRecord> {
      const itemId = asId(id, 'Item menu')
      const token = parse(updatedAtSchema, expectedUpdatedAt)
      const input = parse(menuItemInputSchema, raw)
      return db.transaction(async (tx) => {
        const menu = await menuOf(tx, siteId, location)
        await checkMenuItem(tx, siteId, menu.id, itemId, input)
        const row = await guardedUpdate(
          () => tx.update(menuItems).set({ ...menuItemValues(input), updatedAt: sql`now()` })
            .where(and(eq(menuItems.siteId, siteId), eq(menuItems.menuId, menu.id), eq(menuItems.id, itemId), sameMillis(menuItems.updatedAt, token))).returning(),
          async () => Boolean((await tx.select({ id: menuItems.id }).from(menuItems).where(and(eq(menuItems.siteId, siteId), eq(menuItems.menuId, menu.id), eq(menuItems.id, itemId))).limit(1))[0]),
          'Item menu',
        )
        return toMenuItem(row)
      })
    },

    /** Hapus item menu beserta sub-itemnya (CASCADE). */
    async deleteMenuItem(siteId: SiteId, location: string, id: string, expectedUpdatedAt: string): Promise<void> {
      const itemId = asId(id, 'Item menu')
      const token = parse(updatedAtSchema, expectedUpdatedAt)
      const menu = await menuOf(db, siteId, location)
      await guardedUpdate(
        () => db.delete(menuItems).where(and(eq(menuItems.siteId, siteId), eq(menuItems.menuId, menu.id), eq(menuItems.id, itemId), sameMillis(menuItems.updatedAt, token))).returning({ id: menuItems.id }),
        async () => Boolean((await db.select({ id: menuItems.id }).from(menuItems).where(and(eq(menuItems.siteId, siteId), eq(menuItems.menuId, menu.id), eq(menuItems.id, itemId))).limit(1))[0]),
        'Item menu',
      )
    },
  } satisfies Record<string, SiteScoped>
  return api
}

/** Kode PostgreSQL unique_violation pada constraint slug (uq_<tabel>_site_slug). */
function isSlugConflict(error: unknown): boolean {
  for (let e: unknown = error; e; e = (e as { cause?: unknown }).cause) {
    const pg = e as { code?: string; constraint?: string }
    if (pg.code === '23505' && /_site_slug$/.test(pg.constraint ?? '')) return true
  }
  return false
}

/**
 * Slug dicek dulu (uniqueSlug), tetapi dua simpan bersamaan bisa memilih slug
 * yang sama; constraint database yang menangkapnya diubah menjadi galat field.
 */
async function withSlugConflict<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (isSlugConflict(error)) throw invalid([{ field: 'slug', message: 'slug baru saja dipakai konten lain; simpan lagi atau pilih slug lain' }])
    throw error
  }
}

const mediaListColumns = {
  id: media.id, storageKey: media.storageKey, mimeType: media.mimeType, sizeBytes: media.sizeBytes, width: media.width, height: media.height,
  altText: media.altText, caption: media.caption, credit: media.credit, focalX: media.focalX, focalY: media.focalY,
  createdAt: media.createdAt, updatedAt: media.updatedAt,
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Id dari URL request: bukan uuid = tidak ditemukan (bukan error database). */
function asId(value: string, what: string): string {
  if (!UUID.test(value)) throw notFound(what)
  return value
}

export type EditorRepository = ReturnType<typeof createEditorRepository>
export { EditorError, type FieldIssue }
