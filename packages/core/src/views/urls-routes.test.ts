import { describe, expect, it } from 'vitest'
import { createDateFormatter } from './format'
import { canonicalPathname, matchRoute, parsePageParam } from './routes'
import { createUrlBuilder, RESERVED_SEGMENTS, yearMonthIn } from './urls'

const JKT = 'Asia/Jakarta'

describe('createUrlBuilder (ADR-006)', () => {
  const urls = createUrlBuilder({ timeZone: JKT })
  const art = { slug: 'ponsel-lipat', categorySlug: 'review', publishedAt: new Date('2026-11-10T01:00:00Z') }

  it('prefix tetap', () => {
    expect(urls.home()).toBe('/')
    expect(urls.category('gadget')).toBe('/category/gadget')
    expect(urls.tag('android')).toBe('/tag/android')
    expect(urls.author('budi')).toBe('/author/budi')
    expect(urls.page('tentang-kami')).toBe('/p/tentang-kami')
    expect(urls.search()).toBe('/search')
    expect(urls.search('  ponsel lipat & murah ')).toBe('/search?q=ponsel+lipat+%26+murah')
  })

  it('artikel mengikuti permalink default /:category/:slug', () => {
    expect(urls.article(art)).toBe('/review/ponsel-lipat')
  })

  it('permalink dengan tahun dan bulan memakai zona waktu site, bukan UTC', () => {
    const dated = createUrlBuilder({ permalink: '/:year/:month/:slug', timeZone: JKT })
    // 30 Nov 20:00 UTC = 1 Des 03:00 WIB
    expect(dated.article({ ...art, publishedAt: new Date('2026-11-30T20:00:00Z') })).toBe('/2026/12/ponsel-lipat')
    expect(yearMonthIn(new Date('2026-11-30T20:00:00Z'), 'UTC')).toEqual({ year: '2026', month: '11' })
  })

  it('pagination: halaman 1 tanpa parameter, digabung dengan query yang ada', () => {
    expect(urls.withPage('/category/gadget', 1)).toBe('/category/gadget')
    expect(urls.withPage('/category/gadget', 3)).toBe('/category/gadget?page=3')
    expect(urls.withPage('/search?q=ponsel', 2)).toBe('/search?q=ponsel&page=2')
  })

  it('daftar segmen terlarang memuat semua prefix dan route sistem', () => {
    expect(RESERVED_SEGMENTS).toEqual(['category', 'tag', 'author', 'p', 'search', 'api', 'media', '_nuxt', '__nuxt', 'admin'])
  })
})

describe('matchRoute (ADR-006)', () => {
  it.each([
    ['/', { kind: 'home' }],
    ['/category/gadget', { kind: 'category', slug: 'gadget' }],
    ['/tag/android', { kind: 'tag', slug: 'android' }],
    ['/author/budi-santoso', { kind: 'author', slug: 'budi-santoso' }],
    ['/p/tentang-kami', { kind: 'page', slug: 'tentang-kami' }],
    ['/search', { kind: 'search' }],
    ['/review/ponsel-lipat', { kind: 'article', slug: 'ponsel-lipat' }],
  ])('permalink default: %s', (path, route) => {
    expect(matchRoute(path)).toEqual(route)
  })

  it.each([
    '/review',
    '/review/ponsel-lipat/extra',
    '/review/Ponsel-Lipat',
    '/review//x',
    '/category/Gadget',
    '/review/%2e%2e',
    `/review/${'a'.repeat(201)}`,
  ])('tidak cocok: %s', (path) => {
    expect(matchRoute(path)).toEqual({ kind: 'unknown' })
  })

  it('prefix tetap menang atas permalink (kategori bernama "category" tertutup)', () => {
    expect(matchRoute('/category/gadget', '/:category/:slug')).toEqual({ kind: 'category', slug: 'gadget' })
    // Bukan prefix tetap -> dicoba sebagai permalink; build-page lalu mencari
    // artikelnya dan mengalihkan ke URL kanonik atau 404.
    expect(matchRoute('/search/ponsel', '/:category/:slug')).toEqual({ kind: 'article', slug: 'ponsel' })
  })

  it('permalink lain', () => {
    expect(matchRoute('/2026/11/ponsel-lipat', '/:year/:month/:slug')).toEqual({ kind: 'article', slug: 'ponsel-lipat' })
    expect(matchRoute('/2026/13/ponsel-lipat', '/:year/:month/:slug')).toEqual({ kind: 'unknown' })
    expect(matchRoute('/ponsel-lipat', '/:slug')).toEqual({ kind: 'article', slug: 'ponsel-lipat' })
    expect(matchRoute('/search', '/:slug')).toEqual({ kind: 'search' })
  })

  it('slash di ujung dinormalisasi', () => {
    expect(canonicalPathname('/category/gadget/')).toBe('/category/gadget')
    expect(canonicalPathname('/category/gadget//')).toBe('/category/gadget')
    expect(canonicalPathname('/')).toBeNull()
    expect(canonicalPathname('/category/gadget')).toBeNull()
  })

  it.each([
    [null, 1],
    ['1', 1],
    ['12', 12],
    ['0', null],
    ['-1', null],
    ['2a', null],
    ['', null],
    ['01', null],
    ['9999999', null],
  ])('parsePageParam(%j) = %j', (value, expected) => {
    expect(parsePageParam(value)).toBe(expected)
  })
})

describe('createDateFormatter', () => {
  const dates = createDateFormatter('id-ID', JKT)

  it('tanggal dalam locale dan zona waktu site', () => {
    // 18 Nov 20:00 UTC = 19 Nov 03:00 WIB
    expect(dates.date(new Date('2026-11-18T20:00:00Z'))).toEqual({ iso: '2026-11-18T20:00:00.000Z', label: '19 November 2026' })
  })

  it('hari ini: iso tanggal kalender site, label dengan nama hari', () => {
    expect(dates.today(new Date('2026-11-18T20:00:00Z'))).toEqual({ iso: '2026-11-19', label: 'Kamis, 19 November 2026' })
  })
})
