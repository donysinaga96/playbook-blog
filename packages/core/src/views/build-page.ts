// Request halaman publik -> view model (ADR-005, ADR-006, ADR-007).
//
//   site + path + query  ->  { render: 200/404, chrome + vm + seo }  atau  { redirect }
//
// Satu-satunya tempat yang menyusun data untuk template: URL dari
// createUrlBuilder, tanggal dengan locale dan zona waktu site, gambar
// lewat resolver media. Template tidak pernah melihat repository.
import {
  SECTION_LIMITS,
  type ArticleCardView,
  type ArticlesRequest,
  type BlockView,
  type ChromeView,
  type ImageView,
  type LinkView,
  type MenuItemView,
  type PageViewModel,
  type PaginationView,
  type ResolvedSection,
  type SectionView,
} from '@framework/template-kit'
import type { Block, LenientBody } from '../content/blocks'
import { embedSrc } from '../content/embed'
import { parseContentSeo } from '../content/seo'
import { toImageView, type MediaUrlResolver } from '../media/storage'
import type { Repositories } from '../repositories'
import type { ArticleSummary, CategoryRef } from '../repositories/content-repository'
import type { MenuNode } from '../repositories/menu-repository'
import type { SiteInfo } from '../repositories/site-repository'
import type { MediaRef, Page } from '../repositories/types'
import { calendarDay, createDateFormatter, type DateFormatter } from './format'
import { canonicalPathname, matchRoute, parsePageParam } from './routes'
import { buildSeo, seoMediaIds, type SeoInput, type SeoMeta } from './seo'
import { createUrlBuilder, type UrlBuilder } from './urls'

export interface PageRequest {
  site: SiteInfo
  /** Path tanpa query, mis. /category/gadget. */
  pathname: string
  searchParams: URLSearchParams
  /**
   * Origin domain PRIMARY site untuk URL absolut (canonical, og:url, og:image),
   * mis. https://tekno.example. Dihitung middleware dari request.
   */
  origin: string
  /**
   * Section per jenis halaman dari theme aktif, sudah divalidasi registry
   * template (ADR-008). Kosong atau tidak ada = tanpa section.
   */
  layouts?: { home?: readonly ResolvedSection[] }
}

export interface RenderedPage {
  chrome: ChromeView
  vm: PageViewModel
  seo: SeoMeta
}

export type PageResult =
  | {
      kind: 'render'
      status: 200 | 404
      page: RenderedPage
      /** Untuk log: block yang dilewati, media hilang. Tidak ditampilkan ke pembaca. */
      issues: string[]
    }
  | { kind: 'redirect'; status: 301 | 302 | 307 | 308; location: string }

export interface PageBuilderOptions {
  mediaUrl: MediaUrlResolver
  now?: () => Date
  /** Lokasi menu yang dimuat untuk chrome. Default header dan footer. */
  menuLocations?: readonly string[]
  /** Artikel per halaman listing. Default 10. */
  pageSize?: number
}

/** Label breadcrumb pertama. Site saat ini berbahasa Indonesia; dipindah ke settings bila perlu. */
const HOME_LABEL = 'Beranda'
/** Batas panjang kata kunci pencarian, sama dengan repository. */
const MAX_QUERY = 200

export function createPageBuilder(
  repos: Pick<Repositories, 'content' | 'menus'>,
  options: PageBuilderOptions,
) {
  const { content, menus } = repos
  const now = options.now ?? (() => new Date())
  const menuLocations = options.menuLocations ?? ['header', 'footer']
  const pageSize = options.pageSize ?? 10

  return {
    async build(request: PageRequest): Promise<PageResult> {
      const { site, pathname, searchParams, origin } = request

      const normalized = canonicalPathname(pathname)
      if (normalized) return redirect(301, normalized + queryString(searchParams))

      const ctx: BuildContext = {
        site,
        urls: createUrlBuilder({ permalink: site.settings.permalink, timeZone: site.timezone }),
        dates: createDateFormatter(site.defaultLocale, site.timezone),
        origin,
        issues: [],
      }
      const route = matchRoute(pathname, site.settings.permalink)
      const page = parsePageParam(searchParams.get('page'))

      const built = await (async (): Promise<Built | Redirect | null> => {
        switch (route.kind) {
          case 'home': return page === null ? null : home(ctx, page, request.layouts?.home ?? [])
          case 'category': return page === null ? null : category(ctx, route.slug, page)
          case 'tag': return page === null ? null : tag(ctx, route.slug, page)
          case 'author': return page === null ? null : author(ctx, route.slug, page)
          case 'search': return page === null ? null : search(ctx, searchParams.get('q') ?? '', page)
          case 'page': return staticPage(ctx, route.slug)
          case 'article': return article(ctx, route.slug, pathname)
          case 'unknown': return null
        }
      })()

      if (built && 'kind' in built) return built
      if (built) return render(ctx, 200, built)

      // Tidak ada konten di path ini: redirect tersimpan, lalu 404.
      const rule = await content.findRedirect(site.id, pathname)
      if (rule) return redirect(rule.statusCode, rule.toPath)
      return render(ctx, 404, {
        vm: { view: 'not-found', path: pathname },
        seo: { title: 'Halaman tidak ditemukan', description: null, type: 'website', image: null, canonicalPath: null, noindex: true },
      })
    },
  }

  async function render(ctx: BuildContext, status: 200 | 404, built: Built): Promise<PageResult> {
    const ids = seoMediaIds(ctx.site, built.seo.contentSeo)
    const [chromeView, media] = await Promise.all([
      chrome(ctx),
      ids.length ? content.getMediaByIds(ctx.site.id, ids) : Promise.resolve([]),
    ])
    const byId = new Map(media.map((m) => [m.id, m]))
    const seo = buildSeo(
      {
        site: ctx.site,
        origin: ctx.origin,
        imageById: (id) => {
          const ref = byId.get(id)
          return ref ? image(ref, ctx.site.name) : null
        },
        favicon: ctx.site.favicon ? image(ctx.site.favicon, ctx.site.name) : null,
      },
      built.seo,
    )
    return { kind: 'render', status, page: { chrome: chromeView, vm: built.vm, seo }, issues: ctx.issues }
  }

  // ---------- Jenis halaman ------------------------------------------------

  async function home(ctx: BuildContext, page: number, plans: readonly ResolvedSection[]): Promise<Built | null> {
    const seo: SeoInput = { title: null, description: null, type: 'website', image: null, canonicalPath: ctx.urls.withPage(ctx.urls.home(), page), page }
    const home = ctx.urls.home()

    if (plans.length > 0) {
      // Mode section (ADR-008). Halaman 1 = section. ?page=N (N >= 2) =
      // arsip terbaru yang dimulai dari artikel paling baru (halaman arsip
      // N-1), supaya tidak ada artikel yang tidak terjangkau dari pagination
      // hanya karena section menampilkan lebih sedikit dari pageSize.
      if (page === 1) {
        const [sections, latest] = await Promise.all([
          sectionViews(ctx, plans),
          content.listPublishedArticles(ctx.site.id, { page: 1, pageSize }),
        ])
        return {
          vm: {
            view: 'home',
            sections,
            featured: [],
            // Semua section dilewati (mis. kategori sudah dihapus): tetap tampilkan daftar terbaru.
            latest: sections.length > 0 ? [] : latest.items.map((a) => card(ctx, a)),
            pagination: pagination(ctx, { page: 1, totalPages: latest.totalPages + 1 }, home),
          },
          seo,
        }
      }
      const archive = await content.listPublishedArticles(ctx.site.id, { page: page - 1, pageSize })
      if (page - 1 > archive.totalPages) return null
      return {
        vm: {
          view: 'home',
          sections: [],
          featured: [],
          latest: archive.items.map((a) => card(ctx, a)),
          pagination: pagination(ctx, { page, totalPages: archive.totalPages + 1 }, home),
        },
        seo,
      }
    }

    const [featured, latest] = await Promise.all([
      page === 1 ? content.listPublishedArticles(ctx.site.id, { featuredOnly: true, pageSize: 1 }) : null,
      content.listPublishedArticles(ctx.site.id, { page, pageSize }),
    ])
    if (beyondLastPage(latest)) return null
    const featuredItems = featured?.items ?? []
    const shown = new Set(featuredItems.map((a) => a.id))
    return {
      vm: {
        view: 'home',
        sections: [],
        featured: featuredItems.map((a) => card(ctx, a)),
        latest: latest.items.filter((a) => !shown.has(a.id)).map((a) => card(ctx, a)),
        pagination: pagination(ctx, latest, home),
      },
      seo,
    }
  }

  /**
   * Menjalankan permintaan data section (ADR-008), berurutan: artikel yang
   * sudah tampil di section sebelumnya dikecualikan di query (excludeIds),
   * jadi setiap section tetap terisi penuh bila artikelnya cukup. Batas
   * jumlah section dan limit dijaga ulang di sini: core tidak bergantung
   * pada validasi pemanggil.
   */
  async function sectionViews(ctx: BuildContext, plans: readonly ResolvedSection[]): Promise<SectionView[]> {
    const shown: string[] = []
    const out: SectionView[] = []
    for (const plan of plans.slice(0, SECTION_LIMITS.maxSectionsPerPage)) {
      const request = plan.articles
      if (!request) {
        out.push({ type: plan.type, props: plan.props, articles: [], link: null })
        continue
      }
      const limit = Math.min(Math.max(Math.trunc(request.limit) || 1, 1), SECTION_LIMITS.maxArticles)
      const data = await sectionArticles(ctx, request, limit, shown)
      if (!data) continue
      for (const a of data.items) shown.push(a.id)
      out.push({ type: plan.type, props: plan.props, articles: data.items.map((a) => card(ctx, a)), link: data.link })
    }
    return out
  }

  /** Null = sumber tidak ada (kategori/tag tidak dikenal): section dilewati dan dicatat. */
  async function sectionArticles(ctx: BuildContext, request: ArticlesRequest, size: number, excludeIds: readonly string[]): Promise<SectionData | null> {
    const siteId = ctx.site.id
    switch (request.source) {
      case 'latest':
        return { items: (await content.listPublishedArticles(siteId, { pageSize: size, excludeIds })).items, link: null }
      case 'featured':
        return { items: (await content.listPublishedArticles(siteId, { featuredOnly: true, pageSize: size, excludeIds })).items, link: null }
      case 'category': {
        const slug = request.slug ?? ''
        const [found, list] = await Promise.all([
          content.getCategory(siteId, slug),
          content.listPublishedArticles(siteId, { categorySlug: slug, pageSize: size, excludeIds }),
        ])
        if (!found) {
          ctx.issues.push(`section: kategori "${slug}" tidak ada di site ini, section dilewati`)
          return null
        }
        return { items: list.items, link: { label: found.name, href: ctx.urls.category(found.slug) } }
      }
      case 'tag': {
        const slug = request.slug ?? ''
        const [found, list] = await Promise.all([
          content.getTag(siteId, slug),
          content.listPublishedArticles(siteId, { tagSlug: slug, pageSize: size, excludeIds }),
        ])
        if (!found) {
          ctx.issues.push(`section: tag "${slug}" tidak ada di site ini, section dilewati`)
          return null
        }
        return { items: list.items, link: { label: found.name, href: ctx.urls.tag(found.slug) } }
      }
    }
  }

  async function category(ctx: BuildContext, slug: string, page: number): Promise<Built | null> {
    const found = await content.getCategory(ctx.site.id, slug)
    if (!found) return null
    const list = await content.listPublishedArticles(ctx.site.id, { categorySlug: slug, page, pageSize })
    if (beyondLastPage(list)) return null
    const href = ctx.urls.category(found.slug)
    return {
      vm: {
        view: 'category',
        breadcrumb: [homeCrumb(ctx), ...categoryCrumbs(ctx, found.parent, found)],
        name: found.name,
        description: found.description,
        children: found.children.map((c) => ({ label: c.name, href: ctx.urls.category(c.slug) })),
        articles: list.items.map((a) => card(ctx, a)),
        pagination: pagination(ctx, list, href),
      },
      seo: {
        title: found.name,
        description: found.description,
        type: 'website',
        image: null,
        canonicalPath: ctx.urls.withPage(href, page),
        page,
        contentSeo: parseContentSeo(found.seo),
      },
    }
  }

  async function tag(ctx: BuildContext, slug: string, page: number): Promise<Built | null> {
    const found = await content.getTag(ctx.site.id, slug)
    if (!found) return null
    const list = await content.listPublishedArticles(ctx.site.id, { tagSlug: slug, page, pageSize })
    if (beyondLastPage(list)) return null
    const href = ctx.urls.tag(found.slug)
    return {
      vm: {
        view: 'tag',
        name: found.name,
        articles: list.items.map((a) => card(ctx, a)),
        pagination: pagination(ctx, list, href),
      },
      seo: { title: found.name, description: null, type: 'website', image: null, canonicalPath: ctx.urls.withPage(href, page), page },
    }
  }

  async function author(ctx: BuildContext, slug: string, page: number): Promise<Built | null> {
    const found = await content.getAuthor(ctx.site.id, slug)
    if (!found) return null
    const list = await content.listPublishedArticles(ctx.site.id, { authorSlug: slug, page, pageSize })
    if (beyondLastPage(list)) return null
    const href = ctx.urls.author(found.slug)
    const avatar = found.avatar ? image(found.avatar, found.name) : null
    return {
      vm: {
        view: 'author',
        name: found.name,
        bio: found.bio,
        avatar,
        articles: list.items.map((a) => card(ctx, a)),
        pagination: pagination(ctx, list, href),
      },
      seo: { title: found.name, description: found.bio, type: 'website', image: avatar, canonicalPath: ctx.urls.withPage(href, page), page },
    }
  }

  async function search(ctx: BuildContext, rawQuery: string, page: number): Promise<Built | null> {
    const query = rawQuery.trim().slice(0, MAX_QUERY)
    const list = await content.searchPublishedArticles(ctx.site.id, query, { page, pageSize })
    if (beyondLastPage(list)) return null
    return {
      vm: {
        view: 'search',
        action: ctx.urls.search(),
        query,
        articles: list.items.map((a) => card(ctx, a)),
        pagination: pagination(ctx, list, ctx.urls.search(query)),
      },
      // Hasil pencarian tidak diindeks (konten ganda, kata kunci tak terbatas).
      seo: {
        title: query ? `Pencarian: ${query}` : 'Pencarian',
        description: null,
        type: 'website',
        image: null,
        canonicalPath: ctx.urls.withPage(ctx.urls.search(query), page),
        page,
        noindex: true,
      },
    }
  }

  async function staticPage(ctx: BuildContext, slug: string): Promise<Built | null> {
    const found = await content.getPublishedPage(ctx.site.id, slug)
    if (!found) return null
    return {
      vm: {
        view: 'page',
        title: found.title,
        viewKey: found.viewKey,
        blocks: await blocks(ctx, found.body.blocks, found.bodyIssues, `halaman ${found.slug}`),
      },
      seo: {
        title: found.title,
        description: null,
        type: 'website',
        image: null,
        canonicalPath: ctx.urls.page(found.slug),
        contentSeo: parseContentSeo(found.seo),
      },
    }
  }

  async function article(ctx: BuildContext, slug: string, pathname: string): Promise<Built | Redirect | null> {
    const found = await content.getPublishedArticle(ctx.site.id, slug)
    if (!found) return null
    const href = articleHref(ctx, found)
    // Path benar tetapi bukan URL kanonik (mis. kategori sudah dipindah).
    if (href !== pathname) return redirect(301, href)
    const updated =
      found.updatedAt > found.publishedAt
      && calendarDay(found.updatedAt, ctx.site.timezone) !== calendarDay(found.publishedAt, ctx.site.timezone)
    const featured = found.featuredMedia ? image(found.featuredMedia, found.title) : null
    const vm: PageViewModel = {
      view: 'article',
      breadcrumb: [homeCrumb(ctx), ...categoryCrumbs(ctx, found.categoryParent, found.category), { label: found.title, href }],
      title: found.title,
      excerpt: found.excerpt,
      category: { label: found.category.name, href: ctx.urls.category(found.category.slug) },
      author: found.author ? { label: found.author.name, href: ctx.urls.author(found.author.slug) } : null,
      publishedAt: ctx.dates.date(found.publishedAt),
      updatedAt: updated ? ctx.dates.date(found.updatedAt) : null,
      image: featured,
      tags: found.tags.map((t) => ({ label: t.name, href: ctx.urls.tag(t.slug) })),
      blocks: await blocks(ctx, found.body.blocks, found.bodyIssues, `artikel ${found.slug}`),
      format: found.format,
      references: found.references.map((r) => ({ title: r.title, url: r.url, publisher: r.publisher, kind: r.kind })),
    }
    return {
      vm,
      seo: {
        title: found.title,
        description: found.excerpt,
        type: 'article',
        image: featured,
        canonicalPath: href,
        contentSeo: parseContentSeo(found.seo),
        article: {
          publishedTime: found.publishedAt.toISOString(),
          modifiedTime: found.updatedAt.toISOString(),
          section: found.category.name,
          tags: found.tags.map((t) => t.name),
          author: found.author?.name ?? null,
          citations: found.references.map((r) => ({ name: r.title, url: r.url })),
        },
      },
    }
  }

  // ---------- Bagian bersama -----------------------------------------------

  async function chrome(ctx: BuildContext): Promise<ChromeView> {
    const trees = await Promise.all(menuLocations.map((location) => menus.getMenuTree(ctx.site.id, location)))
    const menuViews: Record<string, MenuItemView[]> = {}
    menuLocations.forEach((location, i) => {
      menuViews[location] = (trees[i]?.items ?? []).map((node) => menuItem(ctx, node))
    })
    const { site } = ctx
    return {
      site: {
        name: site.name,
        tagline: site.settings.tagline ?? null,
        locale: site.defaultLocale,
        logo: site.logo ? image(site.logo, site.name) : null,
        homeHref: ctx.urls.home(),
      },
      menus: menuViews,
      today: ctx.dates.today(now()),
    }
  }

  function menuItem(ctx: BuildContext, node: MenuNode): MenuItemView {
    const { target } = node
    let href: string
    let external = false
    switch (target.type) {
      case 'CATEGORY': href = ctx.urls.category(target.slug); break
      case 'PAGE': href = ctx.urls.page(target.slug); break
      case 'TAG': href = ctx.urls.tag(target.slug); break
      case 'ARTICLE': href = articleHref(ctx, { slug: target.slug, category: { slug: target.categorySlug }, publishedAt: target.publishedAt }); break
      case 'ROUTE': href = target.path; break
      case 'URL': href = target.url; external = true; break
    }
    return {
      label: node.label,
      href,
      external,
      openInNewTab: node.openInNewTab,
      children: node.children.map((child) => menuItem(ctx, child)),
    }
  }

  function card(ctx: BuildContext, a: ArticleSummary): ArticleCardView {
    return {
      href: articleHref(ctx, a),
      title: a.title,
      excerpt: a.excerpt,
      category: { label: a.category.name, href: ctx.urls.category(a.category.slug) },
      author: a.author ? { label: a.author.name, href: ctx.urls.author(a.author.slug) } : null,
      publishedAt: ctx.dates.date(a.publishedAt),
      image: a.featuredMedia ? image(a.featuredMedia, a.title) : null,
      isFeatured: a.isFeatured,
      format: a.format,
    }
  }

  function image(media: MediaRef, fallbackAlt: string): ImageView {
    return toImageView(media, options.mediaUrl, fallbackAlt)
  }

  async function blocks(ctx: BuildContext, source: Block[], skipped: LenientBody['skipped'], label: string): Promise<BlockView[]> {
    for (const s of skipped) {
      ctx.issues.push(`${label}: block #${s.index} (${s.type ?? 'tanpa tipe'}) dilewati: ${s.reason}`)
    }
    const mediaIds = source.flatMap((b) => (b.type === 'image' ? [b.mediaId] : []))
    const media = new Map((mediaIds.length ? await content.getMediaByIds(ctx.site.id, mediaIds) : []).map((m) => [m.id, m]))

    const out: BlockView[] = []
    // Catatan: posisi di `source` tidak sama dengan posisi di body asli
    // (block rusak sudah dibuang), jadi pesan di bawah menyebut id media.
    source.forEach((block) => {
      switch (block.type) {
        case 'image': {
          const ref = media.get(block.mediaId)
          if (!ref) {
            ctx.issues.push(`${label}: block image dilewati: media ${block.mediaId} tidak ada di site ini`)
            return
          }
          out.push({ type: 'image', image: image(ref, block.caption ?? ''), caption: block.caption ?? null })
          return
        }
        case 'quote':
          out.push({ type: 'quote', text: block.text, cite: block.cite ?? null })
          return
        case 'embed':
          out.push({ ...block, embedSrc: embedSrc(block.provider, block.url) })
          return
        default:
          out.push(block)
      }
    })
    return out
  }
}

// ---------- Fungsi murni ---------------------------------------------------

interface BuildContext {
  site: SiteInfo
  urls: UrlBuilder
  dates: DateFormatter
  origin: string
  issues: string[]
}

interface SectionData {
  items: ArticleSummary[]
  link: LinkView | null
}

/** View model halaman + bahan SEO-nya. */
interface Built {
  vm: PageViewModel
  seo: SeoInput
}

type Redirect = Extract<PageResult, { kind: 'redirect' }>

function redirect(status: Redirect['status'], location: string): Redirect {
  return { kind: 'redirect', status, location }
}

function queryString(params: URLSearchParams): string {
  const s = params.toString()
  return s ? `?${s}` : ''
}

function homeCrumb(ctx: BuildContext): LinkView {
  return { label: HOME_LABEL, href: ctx.urls.home() }
}

function categoryCrumbs(ctx: BuildContext, parent: CategoryRef | null, self: Pick<CategoryRef, 'name' | 'slug'>): LinkView[] {
  return [
    ...(parent ? [{ label: parent.name, href: ctx.urls.category(parent.slug) }] : []),
    { label: self.name, href: ctx.urls.category(self.slug) },
  ]
}

function articleHref(ctx: BuildContext, a: { slug: string; category: { slug: string }; publishedAt: Date }): string {
  return ctx.urls.article({ slug: a.slug, categorySlug: a.category.slug, publishedAt: a.publishedAt })
}

/** Halaman di luar jangkauan (mis. ?page=99) = 404. Listing kosong tetap 200 di halaman 1. */
function beyondLastPage(list: Page<unknown>): boolean {
  return list.page > 1 && list.page > list.totalPages
}

/** Nomor halaman yang ditampilkan: 1, terakhir, dan dua di sekitar halaman aktif; celah = null. */
export function pageWindow(page: number, totalPages: number): (number | null)[] {
  const wanted = new Set([1, totalPages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= totalPages))
  const sorted = [...wanted].sort((a, b) => a - b)
  const out: (number | null)[] = []
  sorted.forEach((n, i) => {
    const prev = sorted[i - 1]
    if (prev !== undefined && n - prev > 1) out.push(n - prev === 2 ? n - 1 : null)
    out.push(n)
  })
  return out
}

function pagination(ctx: BuildContext, list: Pick<Page<unknown>, 'page' | 'totalPages'>, baseHref: string): PaginationView {
  const { page, totalPages } = list
  const href = (n: number) => ctx.urls.withPage(baseHref, n)
  return {
    page,
    totalPages,
    prevHref: page > 1 ? href(page - 1) : null,
    nextHref: page < totalPages ? href(page + 1) : null,
    pages: totalPages > 1
      ? pageWindow(page, totalPages).map((n) => (n === null ? null : { number: n, href: href(n), current: n === page }))
      : [],
  }
}
