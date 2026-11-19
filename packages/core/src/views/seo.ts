// Metadata <head> halaman publik: title, description, canonical, robots,
// Open Graph. Dibangun core bersama view model; app memasangnya ke <head>,
// template tidak ikut campur.
//
// Aturan:
//  - title  : judul halaman lewat settings.seo.titleTemplate ("%s | Kabar Tekno");
//             home memakai nama site (+ tagline). Halaman listing ke-N diberi
//             akhiran " – Halaman N" agar tidak ada judul ganda.
//  - description: kolom seo konten > ringkasan konten > settings.seo.defaultDescription.
//  - canonical: URL absolut di domain PRIMARY (origin dari middleware); kolom
//             seo.canonical konten menang. 404 tanpa canonical.
//  - robots : pencarian dan 404 "noindex, follow"; kolom seo.robots konten menang.
//  - og:image: seo.og_image_id konten > gambar konten > settings.seo.defaultOgImageId.
import type { ImageView } from '@framework/template-kit'
import type { ContentSeo } from '../content/seo'
import type { SiteInfo } from '../repositories/site-repository'

export interface SeoMeta {
  title: string
  description: string | null
  /** URL absolut; null = tidak dipasang (404). */
  canonical: string | null
  robots: string | null
  og: {
    type: 'website' | 'article'
    title: string
    description: string | null
    url: string | null
    image: { url: string; alt: string; width: number | null; height: number | null } | null
    siteName: string
    /** Format Open Graph, mis. id_ID. */
    locale: string
  }
  /** Hanya untuk artikel. */
  article: { publishedTime: string; modifiedTime: string; section: string; tags: string[] } | null
  /** URL absolut RSS site, untuk <link rel="alternate">. */
  feedUrl: string
  favicon: string | null
}

/** Bahan SEO dari tiap jenis halaman. */
export interface SeoInput {
  /** Judul halaman tanpa nama site; null = home. */
  title: string | null
  description: string | null
  type: 'website' | 'article'
  image: ImageView | null
  /** Path (+ query) kanonik; null = tanpa canonical. */
  canonicalPath: string | null
  noindex?: boolean
  /** Nomor halaman listing (>1 memberi akhiran judul). */
  page?: number
  contentSeo?: ContentSeo
  article?: SeoMeta['article']
}

export interface SeoContext {
  site: SiteInfo
  /** Origin domain primary, mis. https://tekno.example. */
  origin: string
  /** Gambar OG dari id media (seo.og_image_id, defaultOgImageId); null bila tidak ada. */
  imageById: (id: string) => ImageView | null
  favicon: ImageView | null
}

export const NOINDEX = 'noindex, follow'

export function absoluteUrl(origin: string, href: string): string {
  return /^https?:\/\//.test(href) ? href : `${origin}${href.startsWith('/') ? '' : '/'}${href}`
}

/** id-ID -> id_ID (format og:locale). */
export function ogLocale(locale: string): string {
  return locale.replace('-', '_')
}

export function buildSeo(ctx: SeoContext, input: SeoInput): SeoMeta {
  const { site, origin } = ctx
  const seo = input.contentSeo ?? {}
  const suffix = input.page && input.page > 1 ? ` – Halaman ${input.page}` : ''
  const baseTitle = seo.title ?? input.title

  let title: string
  if (baseTitle === null) {
    title = (site.settings.tagline ? `${site.name} – ${site.settings.tagline}` : site.name) + suffix
  } else {
    const template = site.settings.seo.titleTemplate ?? `%s | ${site.name}`
    title = template.replace('%s', baseTitle + suffix)
  }

  const description = seo.description ?? input.description ?? site.settings.seo.defaultDescription ?? null
  const canonical = seo.canonical
    ? absoluteUrl(origin, seo.canonical)
    : input.canonicalPath === null ? null : absoluteUrl(origin, input.canonicalPath)
  const robots = seo.robots ?? (input.noindex ? NOINDEX : null)

  const image =
    (seo.og_image_id ? ctx.imageById(seo.og_image_id) : null)
    ?? input.image
    ?? (site.settings.seo.defaultOgImageId ? ctx.imageById(site.settings.seo.defaultOgImageId) : null)

  return {
    title,
    description,
    canonical,
    robots,
    og: {
      type: input.type,
      title: baseTitle ?? site.name,
      description,
      url: canonical,
      image: image ? { url: absoluteUrl(origin, image.src), alt: image.alt, width: image.width, height: image.height } : null,
      siteName: site.name,
      locale: ogLocale(site.defaultLocale),
    },
    article: input.article ?? null,
    feedUrl: absoluteUrl(origin, '/rss.xml'),
    favicon: ctx.favicon?.src ?? null,
  }
}

/** Id media yang perlu dimuat untuk og:image (kolom seo konten dan default site). */
export function seoMediaIds(site: SiteInfo, contentSeo: ContentSeo | undefined): string[] {
  return [contentSeo?.og_image_id, site.settings.seo.defaultOgImageId].filter((id): id is string => Boolean(id))
}
