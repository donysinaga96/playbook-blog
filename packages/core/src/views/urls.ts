// Skema URL publik (ADR-006). Satu-satunya tempat yang tahu pola URL:
// view model memakai builder ini, template hanya menerima href jadi.
//
//   artikel   settings.permalink (default /:category/:slug)
//   kategori  /category/{slug}      tag  /tag/{slug}      penulis  /author/{slug}
//   halaman   /p/{slug}             pencarian  /search?q=...
//   pagination ?page=N (halaman 1 tanpa parameter)
import { DEFAULT_PERMALINK } from '../site/settings'

export const PREFIX = {
  category: 'category',
  tag: 'tag',
  author: 'author',
  page: 'p',
  search: 'search',
} as const

/**
 * Segmen pertama yang dipakai prefix publik atau route sistem. Slug yang
 * sama dengan salah satunya tertutup route tetap bila permalink membuatnya
 * bentrok; admin wajib menolaknya saat menyimpan (M4).
 */
export const RESERVED_SEGMENTS = [...Object.values(PREFIX), 'api', 'media', '_nuxt', '__nuxt'] as const

export interface ArticleUrlInput {
  slug: string
  /** Slug kategori artikel itu sendiri (bisa subkategori). */
  categorySlug: string
  publishedAt: Date
}

export interface UrlBuilder {
  home(): string
  article(article: ArticleUrlInput): string
  category(slug: string): string
  tag(slug: string): string
  author(slug: string): string
  page(slug: string): string
  /** /search, atau /search?q=... bila query tidak kosong. */
  search(query?: string): string
  /** Tambah ?page=N (atau &page=N) ke URL listing; halaman 1 dibiarkan tanpa parameter. */
  withPage(href: string, page: number): string
}

/** Tahun dan bulan (2 digit) sebuah waktu di zona waktu site. */
export function yearMonthIn(date: Date, timeZone: string): { year: string; month: string } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(date)
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return { year: pick('year'), month: pick('month') }
}

export function createUrlBuilder(options: { permalink?: string; timeZone: string }): UrlBuilder {
  const permalink = (options.permalink ?? DEFAULT_PERMALINK).split('/').filter(Boolean)

  return {
    home: () => '/',
    article(article) {
      const { year, month } = yearMonthIn(article.publishedAt, options.timeZone)
      const values: Record<string, string> = { ':slug': article.slug, ':category': article.categorySlug, ':year': year, ':month': month }
      return '/' + permalink.map((token) => encodeURIComponent(values[token] ?? token)).join('/')
    },
    category: (slug) => `/${PREFIX.category}/${encodeURIComponent(slug)}`,
    tag: (slug) => `/${PREFIX.tag}/${encodeURIComponent(slug)}`,
    author: (slug) => `/${PREFIX.author}/${encodeURIComponent(slug)}`,
    page: (slug) => `/${PREFIX.page}/${encodeURIComponent(slug)}`,
    search(query) {
      const q = query?.trim()
      return q ? `/${PREFIX.search}?${new URLSearchParams({ q })}` : `/${PREFIX.search}`
    },
    withPage(href, page) {
      if (page <= 1) return href
      return `${href}${href.includes('?') ? '&' : '?'}page=${page}`
    },
  }
}
