// Path request -> jenis halaman (ADR-006). Murni: tidak membaca database.
// Prefix tetap dicocokkan lebih dulu, sisanya ke pola permalink site.
import { DEFAULT_PERMALINK } from '../site/settings'
import { PREFIX } from './urls'

export type Route =
  | { kind: 'home' }
  | { kind: 'category'; slug: string }
  | { kind: 'tag'; slug: string }
  | { kind: 'author'; slug: string }
  | { kind: 'page'; slug: string }
  | { kind: 'search' }
  | { kind: 'article'; slug: string }
  | { kind: 'unknown' }

/** Format slug di semua tabel konten (lihat constraint *_slug_format). */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const TOKEN_FORMAT: Record<string, RegExp> = {
  ':slug': SLUG,
  ':category': SLUG,
  ':year': /^\d{4}$/,
  ':month': /^(0[1-9]|1[0-2])$/,
}

/** Path tanpa query. Slash ganda atau segmen kosong di tengah = tidak cocok. */
export function matchRoute(pathname: string, permalink: string = DEFAULT_PERMALINK): Route {
  if (pathname === '/') return { kind: 'home' }
  const segments = pathname.split('/').slice(1)
  if (segments.some((s) => s === '' || s.length > 200)) return { kind: 'unknown' }

  const [first, second] = segments
  if (segments.length === 1 && first === PREFIX.search) return { kind: 'search' }
  if (segments.length === 2 && second !== undefined && SLUG.test(second)) {
    switch (first) {
      case PREFIX.category: return { kind: 'category', slug: second }
      case PREFIX.tag: return { kind: 'tag', slug: second }
      case PREFIX.author: return { kind: 'author', slug: second }
      case PREFIX.page: return { kind: 'page', slug: second }
    }
  }

  const tokens = permalink.split('/').filter(Boolean)
  if (tokens.length !== segments.length) return { kind: 'unknown' }
  let slug: string | undefined
  for (const [i, token] of tokens.entries()) {
    const value = segments[i] as string
    const format = TOKEN_FORMAT[token]
    if (!format || !format.test(value)) return { kind: 'unknown' }
    if (token === ':slug') slug = value
  }
  return slug ? { kind: 'article', slug } : { kind: 'unknown' }
}

/**
 * Normalisasi sebelum pencocokan: slash di ujung dibuang. Mengembalikan path
 * yang sudah benar, atau null bila path sudah normal.
 */
export function canonicalPathname(pathname: string): string | null {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.replace(/\/+$/, '') || '/'
  return null
}

/** Nomor halaman dari ?page=. Tidak ada -> 1; tidak valid -> null (404). */
export function parsePageParam(value: string | null): number | null {
  if (value === null) return 1
  return /^[1-9]\d{0,5}$/.test(value) ? Number(value) : null
}
