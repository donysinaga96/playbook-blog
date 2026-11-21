import {
  and,
  articleTags,
  articles,
  asc,
  authors,
  categories,
  count,
  desc,
  eq,
  inArray,
  notInArray,
  pages,
  redirects,
  sql,
  tags,
  type SQL,
} from '@framework/db'
import { parseBodyLenient, type Body, type LenientBody } from '../content/blocks'
import { loadMedia, publiclyVisible } from './shared'
import {
  emptyPage,
  normalizePaging,
  toPage,
  type MediaRef,
  type Page,
  type PageQuery,
  type RepositoryContext,
  type SiteId,
  type SiteScoped,
} from './types'

export interface CategoryRef {
  id: string
  name: string
  slug: string
}
export interface AuthorRef {
  id: string
  name: string
  slug: string
}
export interface TagRef {
  id: string
  name: string
  slug: string
}

export interface ArticleSummary {
  id: string
  title: string
  slug: string
  excerpt: string | null
  format: string
  isFeatured: boolean
  publishedAt: Date
  category: CategoryRef
  /** Null bila artikel tanpa penulis atau penulisnya berstatus HIDDEN. */
  author: AuthorRef | null
  featuredMedia: MediaRef | null
  tags: TagRef[]
  /** Titik ekstensi per topik (rating review, waktu masak, ...); skema Zod per jenis site. */
  attributes: Record<string, unknown>
}

export interface ArticleDetail extends ArticleSummary {
  body: Body
  /** Block yang dilewati saat membaca body (tipe tidak dikenal / rusak). Untuk dicatat ke log. */
  bodyIssues: LenientBody['skipped']
  seo: Record<string, unknown>
  updatedAt: Date
  /** Induk kategori, untuk breadcrumb. */
  categoryParent: CategoryRef | null
}

export interface ArticleListQuery extends PageQuery {
  /** Termasuk artikel di sub-kategorinya. Slug tidak dikenal atau HIDDEN -> hasil kosong. */
  categorySlug?: string
  tagSlug?: string
  /** Penulis HIDDEN dianggap tidak ada. */
  authorSlug?: string
  featuredOnly?: boolean
  /** Artikel yang tidak diikutkan (mis. sudah tampil di section sebelumnya). Paling banyak 200 id. */
  excludeIds?: readonly string[]
}

export interface PageDetail {
  id: string
  title: string
  slug: string
  /** Memilih varian view template, mis. 'contact'. */
  viewKey: string
  body: Body
  bodyIssues: LenientBody['skipped']
  seo: Record<string, unknown>
  publishedAt: Date
  updatedAt: Date
}

export interface CategoryNode extends CategoryRef {
  children: CategoryNode[]
}
export interface CategoryDetail extends CategoryRef {
  description: string | null
  seo: Record<string, unknown>
  parent: CategoryRef | null
  children: CategoryRef[]
}
export interface AuthorDetail extends AuthorRef {
  bio: string | null
  avatar: MediaRef | null
  links: Record<string, unknown>
}

/** Semua URL publik site untuk sitemap.xml; hanya konten yang tampil publik. */
export interface SitemapEntries {
  articles: { id: string; slug: string; categorySlug: string; publishedAt: Date; updatedAt: Date }[]
  pages: { id: string; slug: string; updatedAt: Date }[]
  /** Kategori ACTIVE. */
  categories: { id: string; slug: string }[]
  /** Hanya tag dan penulis yang punya artikel tampil (halaman kosong tidak diumumkan). */
  tags: { id: string; slug: string }[]
  authors: { id: string; slug: string }[]
}

/** Batas excludeIds per query, agar daftar dari pemanggil tidak membuat query tanpa batas. */
export const MAX_EXCLUDE_IDS = 200

/** Batas URL per file sitemap (protokol sitemaps.org). */
export const SITEMAP_MAX_ARTICLES = 50_000

export interface RedirectRule {
  toPath: string
  statusCode: 301 | 302 | 307 | 308
}

/**
 * Path request -> bentuk di tabel redirects: tanpa query/hash, tanpa slash di
 * ujung (kecuali "/"). Null bila bukan path internal yang valid.
 */
export function normalizePath(path: string): string | null {
  const bare = path.split('#')[0]?.split('?')[0] ?? ''
  if (!bare.startsWith('/') || bare.startsWith('//') || /\s/.test(bare)) return null
  return bare.length > 1 ? bare.replace(/\/+$/, '') || '/' : bare
}

/**
 * Repository konten publik. SEMUA fungsi menerima siteId sebagai argumen
 * pertama dan setiap query menyaring siteId pada setiap tabel yang disentuh,
 * sehingga data site lain tidak pernah terbaca walau slug sama (mis.
 * "tentang-kami" ada di dua site). Hanya konten yang sudah tampil publik
 * (PUBLISHED dan published_at <= now) yang dikembalikan.
 */
export function createContentRepository(ctx: RepositoryContext) {
  const { db } = ctx

  async function loadSummaries(siteId: SiteId, ids: string[]): Promise<ArticleSummary[]> {
    if (ids.length === 0) return []
    const [rows, tagRows] = await Promise.all([
      db
        .select({
          id: articles.id,
          title: articles.title,
          slug: articles.slug,
          excerpt: articles.excerpt,
          format: articles.format,
          isFeatured: articles.isFeatured,
          publishedAt: articles.publishedAt,
          attributes: articles.attributes,
          featuredMediaId: articles.featuredMediaId,
          categoryId: categories.id,
          categoryName: categories.name,
          categorySlug: categories.slug,
          authorId: authors.id,
          authorName: authors.name,
          authorSlug: authors.slug,
        })
        .from(articles)
        .innerJoin(categories, and(eq(categories.siteId, articles.siteId), eq(categories.id, articles.categoryId)))
        .leftJoin(
          authors,
          and(eq(authors.siteId, articles.siteId), eq(authors.id, articles.authorId), eq(authors.status, 'ACTIVE')),
        )
        .where(and(eq(articles.siteId, siteId), inArray(articles.id, ids))),
      db
        .select({ articleId: articleTags.articleId, id: tags.id, name: tags.name, slug: tags.slug })
        .from(articleTags)
        .innerJoin(tags, and(eq(tags.siteId, articleTags.siteId), eq(tags.id, articleTags.tagId)))
        .where(and(eq(articleTags.siteId, siteId), inArray(articleTags.articleId, ids)))
        .orderBy(asc(articleTags.sortOrder), asc(tags.name)),
    ])
    const media = await loadMedia(ctx, siteId, rows.map((r) => r.featuredMediaId))

    const byId = new Map(
      rows.map((r): [string, ArticleSummary] => [
        r.id,
        {
          id: r.id,
          title: r.title,
          slug: r.slug,
          excerpt: r.excerpt,
          format: r.format,
          isFeatured: r.isFeatured,
          publishedAt: r.publishedAt as Date,
          category: { id: r.categoryId, name: r.categoryName, slug: r.categorySlug },
          author: r.authorId && r.authorName && r.authorSlug ? { id: r.authorId, name: r.authorName, slug: r.authorSlug } : null,
          featuredMedia: (r.featuredMediaId && media.get(r.featuredMediaId)) || null,
          tags: tagRows.filter((t) => t.articleId === r.id).map(({ id, name, slug }) => ({ id, name, slug })),
          attributes: r.attributes as Record<string, unknown>,
        },
      ]),
    )
    // Pertahankan urutan ids (urutan feed).
    return ids.map((id) => byId.get(id)).filter((a): a is ArticleSummary => a !== undefined)
  }

  /** Kategori ACTIVE dengan slug ini, ditambah seluruh turunannya yang ACTIVE. */
  async function categoryScopeIds(siteId: SiteId, slug: string): Promise<string[]> {
    const all = await db
      .select({ id: categories.id, parentId: categories.parentId, slug: categories.slug })
      .from(categories)
      .where(and(eq(categories.siteId, siteId), eq(categories.status, 'ACTIVE')))
    const root = all.find((c) => c.slug === slug)
    if (!root) return []
    const ids = [root.id]
    for (let i = 0; i < ids.length; i++) {
      for (const child of all) if (child.parentId === ids[i] && !ids.includes(child.id)) ids.push(child.id)
    }
    return ids
  }

  async function pageOfArticleIds(
    siteId: SiteId,
    where: SQL | undefined,
    order: SQL[],
    paging: { page: number; pageSize: number; offset: number },
  ): Promise<Page<ArticleSummary>> {
    const [totalRow] = await db.select({ total: count() }).from(articles).where(where)
    const total = totalRow?.total ?? 0
    if (total === 0) return emptyPage(paging)
    const idRows = await db
      .select({ id: articles.id })
      .from(articles)
      .where(where)
      .orderBy(...order)
      .limit(paging.pageSize)
      .offset(paging.offset)
    const items = await loadSummaries(siteId, idRows.map((r) => r.id))
    return toPage(items, total, paging.page, paging.pageSize)
  }

  return {
    /** Feed publik, terbaru dulu. Filter kategori/tag/penulis/featured bersifat opsional. */
    async listPublishedArticles(siteId: SiteId, query: ArticleListQuery = {}): Promise<Page<ArticleSummary>> {
      const paging = normalizePaging(query)
      const conditions = [eq(articles.siteId, siteId), publiclyVisible(articles, ctx.now())]

      if (query.featuredOnly) conditions.push(eq(articles.isFeatured, true))
      if (query.excludeIds && query.excludeIds.length > 0) {
        conditions.push(notInArray(articles.id, [...query.excludeIds].slice(0, MAX_EXCLUDE_IDS)))
      }

      if (query.categorySlug !== undefined) {
        const ids = await categoryScopeIds(siteId, query.categorySlug)
        if (ids.length === 0) return emptyPage(paging)
        conditions.push(inArray(articles.categoryId, ids))
      }
      if (query.authorSlug !== undefined) {
        const [author] = await db
          .select({ id: authors.id })
          .from(authors)
          .where(and(eq(authors.siteId, siteId), eq(authors.slug, query.authorSlug), eq(authors.status, 'ACTIVE')))
        if (!author) return emptyPage(paging)
        conditions.push(eq(articles.authorId, author.id))
      }
      if (query.tagSlug !== undefined) {
        const [tag] = await db
          .select({ id: tags.id })
          .from(tags)
          .where(and(eq(tags.siteId, siteId), eq(tags.slug, query.tagSlug)))
        if (!tag) return emptyPage(paging)
        conditions.push(
          inArray(
            articles.id,
            db
              .select({ id: articleTags.articleId })
              .from(articleTags)
              .where(and(eq(articleTags.siteId, siteId), eq(articleTags.tagId, tag.id))),
          ),
        )
      }

      return pageOfArticleIds(siteId, and(...conditions), [desc(articles.publishedAt), desc(articles.id)], paging)
    },

    /** Pencarian teks (konfigurasi 'simple'), paling relevan dulu. Query kosong -> hasil kosong. */
    async searchPublishedArticles(siteId: SiteId, queryText: string, query: PageQuery = {}): Promise<Page<ArticleSummary>> {
      const paging = normalizePaging(query)
      const q = queryText.trim().slice(0, 200)
      if (q === '') return emptyPage(paging)
      const tsquery = sql`websearch_to_tsquery('simple', ${q})`
      const where = and(
        eq(articles.siteId, siteId),
        publiclyVisible(articles, ctx.now()),
        sql`${articles.searchVector} @@ ${tsquery}`,
      )
      return pageOfArticleIds(
        siteId,
        where,
        [desc(sql`ts_rank(${articles.searchVector}, ${tsquery})`), desc(articles.publishedAt), desc(articles.id)],
        paging,
      )
    },

    async getPublishedArticle(siteId: SiteId, slug: string): Promise<ArticleDetail | null> {
      const [row] = await db
        .select({
          id: articles.id,
          body: articles.body,
          seo: articles.seo,
          updatedAt: articles.updatedAt,
          categoryParentId: categories.parentId,
        })
        .from(articles)
        .innerJoin(categories, and(eq(categories.siteId, articles.siteId), eq(categories.id, articles.categoryId)))
        .where(and(eq(articles.siteId, siteId), eq(articles.slug, slug), publiclyVisible(articles, ctx.now())))
        .limit(1)
      if (!row) return null

      const [summary] = await loadSummaries(siteId, [row.id])
      if (!summary) return null
      let categoryParent: CategoryRef | null = null
      if (row.categoryParentId) {
        const [parent] = await db
          .select({ id: categories.id, name: categories.name, slug: categories.slug })
          .from(categories)
          .where(and(eq(categories.siteId, siteId), eq(categories.id, row.categoryParentId)))
        categoryParent = parent ?? null
      }
      const { body, skipped } = parseBodyLenient(row.body)
      return {
        ...summary,
        body,
        bodyIssues: skipped,
        seo: row.seo as Record<string, unknown>,
        updatedAt: row.updatedAt,
        categoryParent,
      }
    },

    async getPublishedPage(siteId: SiteId, slug: string): Promise<PageDetail | null> {
      const [row] = await db
        .select()
        .from(pages)
        .where(and(eq(pages.siteId, siteId), eq(pages.slug, slug), publiclyVisible(pages, ctx.now())))
        .limit(1)
      if (!row) return null
      const { body, skipped } = parseBodyLenient(row.body)
      return {
        id: row.id,
        title: row.title,
        slug: row.slug,
        viewKey: row.viewKey,
        body,
        bodyIssues: skipped,
        seo: row.seo as Record<string, unknown>,
        publishedAt: row.publishedAt as Date,
        updatedAt: row.updatedAt,
      }
    },

    /** Kategori ACTIVE sebagai pohon, urut sort_order lalu nama. */
    async getCategoryTree(siteId: SiteId): Promise<CategoryNode[]> {
      const rows = await db
        .select({
          id: categories.id,
          name: categories.name,
          slug: categories.slug,
          parentId: categories.parentId,
        })
        .from(categories)
        .where(and(eq(categories.siteId, siteId), eq(categories.status, 'ACTIVE')))
        .orderBy(asc(categories.sortOrder), asc(categories.name))
      const nodes = new Map<string, CategoryNode>(rows.map((r) => [r.id, { id: r.id, name: r.name, slug: r.slug, children: [] }]))
      const roots: CategoryNode[] = []
      for (const r of rows) {
        const node = nodes.get(r.id) as CategoryNode
        const parent = r.parentId ? nodes.get(r.parentId) : undefined
        if (parent) parent.children.push(node)
        else if (!r.parentId) roots.push(node)
        // Anak dari kategori HIDDEN ikut tersembunyi.
      }
      return roots
    },

    async getCategory(siteId: SiteId, slug: string): Promise<CategoryDetail | null> {
      const [row] = await db
        .select()
        .from(categories)
        .where(and(eq(categories.siteId, siteId), eq(categories.slug, slug), eq(categories.status, 'ACTIVE')))
        .limit(1)
      if (!row) return null
      const [parent, children] = await Promise.all([
        row.parentId
          ? db
              .select({ id: categories.id, name: categories.name, slug: categories.slug })
              .from(categories)
              .where(and(eq(categories.siteId, siteId), eq(categories.id, row.parentId), eq(categories.status, 'ACTIVE')))
          : Promise.resolve([]),
        db
          .select({ id: categories.id, name: categories.name, slug: categories.slug })
          .from(categories)
          .where(and(eq(categories.siteId, siteId), eq(categories.parentId, row.id), eq(categories.status, 'ACTIVE')))
          .orderBy(asc(categories.sortOrder), asc(categories.name)),
      ])
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        seo: row.seo as Record<string, unknown>,
        parent: parent[0] ?? null,
        children,
      }
    },

    async getTag(siteId: SiteId, slug: string): Promise<TagRef | null> {
      const [row] = await db
        .select({ id: tags.id, name: tags.name, slug: tags.slug })
        .from(tags)
        .where(and(eq(tags.siteId, siteId), eq(tags.slug, slug)))
        .limit(1)
      return row ?? null
    },

    async getAuthor(siteId: SiteId, slug: string): Promise<AuthorDetail | null> {
      const [row] = await db
        .select()
        .from(authors)
        .where(and(eq(authors.siteId, siteId), eq(authors.slug, slug), eq(authors.status, 'ACTIVE')))
        .limit(1)
      if (!row) return null
      const avatar = await loadMedia(ctx, siteId, [row.avatarMediaId])
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        bio: row.bio,
        avatar: (row.avatarMediaId && avatar.get(row.avatarMediaId)) || null,
        links: row.links as Record<string, unknown>,
      }
    },

    /**
     * Media milik site ini per id, mis. untuk block gambar di body artikel.
     * Id milik site lain atau yang tidak ada diam-diam tidak ikut.
     */
    async getMediaByIds(siteId: SiteId, ids: string[]): Promise<MediaRef[]> {
      const found = await loadMedia(ctx, siteId, ids)
      return [...found.values()]
    },

    async listSitemapEntries(siteId: SiteId): Promise<SitemapEntries> {
      const visible = and(eq(articles.siteId, siteId), publiclyVisible(articles, ctx.now()))
      const [articleRows, pageRows, categoryRows, tagRows, authorRows] = await Promise.all([
        db
          .select({
            id: articles.id,
            slug: articles.slug,
            categorySlug: categories.slug,
            publishedAt: articles.publishedAt,
            updatedAt: articles.updatedAt,
          })
          .from(articles)
          .innerJoin(categories, and(eq(categories.siteId, articles.siteId), eq(categories.id, articles.categoryId)))
          .where(visible)
          .orderBy(desc(articles.publishedAt), desc(articles.id))
          .limit(SITEMAP_MAX_ARTICLES),
        db
          .select({ id: pages.id, slug: pages.slug, updatedAt: pages.updatedAt })
          .from(pages)
          .where(and(eq(pages.siteId, siteId), publiclyVisible(pages, ctx.now())))
          .orderBy(asc(pages.slug)),
        db
          .select({ id: categories.id, slug: categories.slug })
          .from(categories)
          .where(and(eq(categories.siteId, siteId), eq(categories.status, 'ACTIVE')))
          .orderBy(asc(categories.slug)),
        db
          .selectDistinct({ id: tags.id, slug: tags.slug })
          .from(tags)
          .innerJoin(articleTags, and(eq(articleTags.siteId, tags.siteId), eq(articleTags.tagId, tags.id)))
          .innerJoin(articles, and(eq(articles.siteId, articleTags.siteId), eq(articles.id, articleTags.articleId)))
          .where(and(eq(tags.siteId, siteId), visible))
          .orderBy(asc(tags.slug)),
        db
          .selectDistinct({ id: authors.id, slug: authors.slug })
          .from(authors)
          .innerJoin(articles, and(eq(articles.siteId, authors.siteId), eq(articles.authorId, authors.id)))
          .where(and(eq(authors.siteId, siteId), eq(authors.status, 'ACTIVE'), visible))
          .orderBy(asc(authors.slug)),
      ])
      return {
        articles: articleRows.map((r) => ({ ...r, publishedAt: r.publishedAt as Date })),
        pages: pageRows,
        categories: categoryRows,
        tags: tagRows,
        authors: authorRows,
      }
    },

    /** Aturan redirect untuk path lama; null bila tidak ada atau path tidak valid. */
    async findRedirect(siteId: SiteId, fromPath: string): Promise<RedirectRule | null> {
      const path = normalizePath(fromPath)
      if (!path) return null
      const [row] = await db
        .select({ toPath: redirects.toPath, statusCode: redirects.statusCode })
        .from(redirects)
        .where(and(eq(redirects.siteId, siteId), eq(redirects.fromPath, path)))
        .limit(1)
      return row ? { toPath: row.toPath, statusCode: row.statusCode as RedirectRule['statusCode'] } : null
    },
  } satisfies Record<string, SiteScoped>
}

export type ContentRepository = ReturnType<typeof createContentRepository>
