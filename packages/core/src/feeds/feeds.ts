// sitemap.xml, rss.xml, robots.txt per site (ADR-006). URL absolut selalu di
// domain PRIMARY site (origin dari middleware), sehingga domain alias tidak
// pernah diumumkan ke mesin pencari. Hanya konten yang tampil publik: artikel
// terjadwal baru muncul setelah published_at lewat.
import type { Repositories } from '../repositories'
import type { SiteInfo } from '../repositories/site-repository'
import { absoluteUrl } from '../views/seo'
import { createUrlBuilder, PREFIX } from '../views/urls'

/** Jumlah artikel di RSS. */
export const RSS_ITEMS = 20

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }

/** Escape teks untuk isi elemen dan atribut XML; karakter kontrol yang dilarang XML 1.0 dibuang. */
export function escapeXml(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replace(/[&<>"']/g, (c) => XML_ESCAPES[c] ?? c)
}

export interface SitemapUrl {
  loc: string
  lastmod?: Date
}

export function renderSitemap(urls: SitemapUrl[]): string {
  const body = urls
    .map((u) => `  <url><loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod.toISOString()}</lastmod>` : ''}</url>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
}

export interface RssChannel {
  title: string
  link: string
  description: string
  language: string
  selfUrl: string
}

export interface RssItem {
  title: string
  link: string
  /** Stabil walau URL artikel berubah (kategori/permalink diganti). */
  guid: string
  pubDate: Date
  description: string | null
  category: string
  author: string | null
}

export function renderRss(channel: RssChannel, items: RssItem[]): string {
  const lastBuild = items[0]?.pubDate
  const itemXml = items.map((i) => [
    '    <item>',
    `      <title>${escapeXml(i.title)}</title>`,
    `      <link>${escapeXml(i.link)}</link>`,
    `      <guid isPermaLink="false">${escapeXml(i.guid)}</guid>`,
    `      <pubDate>${i.pubDate.toUTCString()}</pubDate>`,
    `      <category>${escapeXml(i.category)}</category>`,
    i.author ? `      <dc:creator>${escapeXml(i.author)}</dc:creator>` : null,
    i.description ? `      <description>${escapeXml(i.description)}</description>` : null,
    '    </item>',
  ].filter(Boolean).join('\n')).join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    '  <channel>',
    `    <title>${escapeXml(channel.title)}</title>`,
    `    <link>${escapeXml(channel.link)}</link>`,
    `    <description>${escapeXml(channel.description)}</description>`,
    `    <language>${escapeXml(channel.language)}</language>`,
    `    <atom:link href="${escapeXml(channel.selfUrl)}" rel="self" type="application/rss+xml"/>`,
    lastBuild ? `    <lastBuildDate>${lastBuild.toUTCString()}</lastBuildDate>` : null,
    itemXml || null,
    '  </channel>',
    '</rss>',
    '',
  ].filter((line) => line !== null).join('\n')
}

/** Pencarian tidak di-crawl (hasil tak terbatas, konten ganda); /api/ bukan halaman. */
export function renderRobots(origin: string): string {
  return [
    'User-agent: *',
    'Disallow: /api/',
    `Disallow: /${PREFIX.search}`,
    '',
    `Sitemap: ${absoluteUrl(origin, '/sitemap.xml')}`,
    '',
  ].join('\n')
}

export function createFeedBuilder(repos: Pick<Repositories, 'content'>) {
  const { content } = repos

  return {
    async sitemap(site: SiteInfo, origin: string): Promise<string> {
      const urls = createUrlBuilder({ permalink: site.settings.permalink, timeZone: site.timezone })
      const abs = (href: string) => absoluteUrl(origin, href)
      const entries = await content.listSitemapEntries(site.id)
      return renderSitemap([
        { loc: abs(urls.home()), ...(entries.articles[0] ? { lastmod: entries.articles[0].publishedAt } : {}) },
        ...entries.articles.map((a) => ({
          loc: abs(urls.article({ slug: a.slug, categorySlug: a.categorySlug, publishedAt: a.publishedAt })),
          lastmod: a.updatedAt > a.publishedAt ? a.updatedAt : a.publishedAt,
        })),
        ...entries.pages.map((p) => ({ loc: abs(urls.page(p.slug)), lastmod: p.updatedAt })),
        ...entries.categories.map((c) => ({ loc: abs(urls.category(c.slug)) })),
        ...entries.tags.map((t) => ({ loc: abs(urls.tag(t.slug)) })),
        ...entries.authors.map((a) => ({ loc: abs(urls.author(a.slug)) })),
      ])
    },

    async rss(site: SiteInfo, origin: string): Promise<string> {
      const urls = createUrlBuilder({ permalink: site.settings.permalink, timeZone: site.timezone })
      const latest = await content.listPublishedArticles(site.id, { pageSize: RSS_ITEMS })
      return renderRss(
        {
          title: site.name,
          link: absoluteUrl(origin, urls.home()),
          description: site.settings.tagline ?? site.settings.seo.defaultDescription ?? site.name,
          language: site.defaultLocale.toLowerCase(),
          selfUrl: absoluteUrl(origin, '/rss.xml'),
        },
        latest.items.map((a) => ({
          title: a.title,
          link: absoluteUrl(origin, urls.article({ slug: a.slug, categorySlug: a.category.slug, publishedAt: a.publishedAt })),
          guid: `urn:uuid:${a.id}`,
          pubDate: a.publishedAt,
          description: a.excerpt,
          category: a.category.name,
          author: a.author?.name ?? null,
        })),
      )
    },
  }
}
