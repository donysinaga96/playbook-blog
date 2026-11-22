// Pembangun view model halaman publik.
//  1. pageWindow (murni).
//  2. Terhadap database dev yang di-seed (dilewati tanpa DATABASE_URL), jam
//     dipatok 19 Nov 2026: setiap jenis halaman, redirect, 404, dua site.
import { createDatabase } from '@framework/db'
import { SECTION_LIMITS, type ResolvedSection } from '@framework/template-kit'
import { afterAll, describe, expect, it } from 'vitest'
import { parseBodyLenient } from '../content/blocks'
import { parseSiteSettings } from '../site/settings'
import { createMediaUrlResolver } from '../media/storage'
import { createRepositories, type ArticleDetail, type SiteInfo } from '../repositories'
import { createPageBuilder, pageWindow, type PageRequest, type PageResult } from './build-page'

describe('pageWindow', () => {
  it.each([
    [1, 1, [1]],
    [1, 3, [1, 2, 3]],
    [1, 9, [1, 2, null, 9]],
    [5, 9, [1, null, 4, 5, 6, null, 9]],
    [3, 9, [1, 2, 3, 4, null, 9]],
    [9, 9, [1, null, 8, 9]],
  ])('halaman %i dari %i', (page, total, expected) => {
    expect(pageWindow(page, total)).toEqual(expected)
  })
})

const NOW = new Date('2026-11-19T05:00:00Z')

describe.skipIf(!process.env['DATABASE_URL'])('createPageBuilder (database dev, role blog_app)', () => {
  const db = createDatabase({ connectionString: process.env['DATABASE_URL'] ?? '', max: 3, applicationName: 'vitest-views' })
  const repos = createRepositories(db, { now: () => NOW })
  const builder = createPageBuilder(repos, { mediaUrl: createMediaUrlResolver(), now: () => NOW, pageSize: 1 })
  afterAll(() => db.$client.end())

  const sites = new Map<string, SiteInfo>()
  async function site(code: string): Promise<SiteInfo> {
    if (!sites.has(code)) {
      const found = await repos.sites.findByCode(code)
      if (!found) throw new Error(`site seed ${code} tidak ada`)
      sites.set(code, found)
    }
    return sites.get(code) as SiteInfo
  }

  async function build(code: string, url: string, home?: ResolvedSection[]): Promise<PageResult> {
    const parsed = new URL(url, 'http://x')
    const origin = code === 'kabar-tekno' ? 'https://tekno.localhost' : 'https://kuliner.localhost'
    const request: PageRequest = { site: await site(code), pathname: parsed.pathname, searchParams: parsed.searchParams, origin, layouts: home ? { home } : undefined }
    return builder.build(request)
  }

  async function render(code: string, url: string, home?: ResolvedSection[]) {
    const result = await build(code, url, home)
    if (result.kind !== 'render') throw new Error(`${url}: diharapkan render, dapat ${JSON.stringify(result)}`)
    return result
  }

  it('chrome: identitas site, menu bersarang dengan URL jadi, tanggal hari ini', async () => {
    const { page } = await render('kabar-tekno', '/')
    expect(page.chrome.site).toEqual({
      name: 'Kabar Tekno',
      tagline: 'Teknologi tanpa jargon',
      locale: 'id-ID',
      logo: expect.objectContaining({ src: '/media/kabar-tekno/logo.svg', alt: 'Logo Kabar Tekno' }),
      homeHref: '/',
    })
    expect(page.chrome.menus['header']).toEqual([
      { label: 'Beranda', href: '/', external: false, openInNewTab: false, children: [] },
      { label: 'Gadget', href: '/category/gadget', external: false, openInNewTab: false, children: [
        { label: 'Review', href: '/category/review', external: false, openInNewTab: false, children: [] },
      ] },
      { label: 'AI', href: '/category/kecerdasan-buatan', external: false, openInNewTab: false, children: [] },
    ])
    expect(page.chrome.menus['footer']?.map((m) => [m.href, m.external])).toEqual([['/p/tentang-kami', false], ['https://x.com/kabartekno', true]])
    expect(page.chrome.today).toEqual({ iso: '2026-11-19', label: 'Kamis, 19 November 2026' })
  })

  it('home: artikel featured di atas, sisanya terbaru dengan pagination; terjadwal tidak muncul', async () => {
    const { status, page } = await render('kabar-tekno', '/')
    expect(status).toBe(200)
    if (page.vm.view !== 'home') throw new Error('bukan home')
    expect(page.vm.featured.map((a) => a.href)).toEqual(['/review/ponsel-lipat-makin-murah'])
    expect(page.vm.latest.map((a) => a.href)).toEqual(['/kecerdasan-buatan/cara-kerja-model-bahasa'])
    expect(page.vm.pagination).toMatchObject({ page: 1, totalPages: 2, prevHref: null, nextHref: '/?page=2' })
    const card = page.vm.featured[0]
    expect(card).toMatchObject({
      title: expect.any(String),
      category: { label: 'Review', href: '/category/review' },
      author: { label: 'Budi Santoso', href: '/author/budi-santoso' },
      publishedAt: { label: '10 November 2026' },
      image: { src: '/media/kabar-tekno/2026/11/hp.webp', focalX: 0.62 },
    })
  })

  it('home halaman 2 tanpa featured; halaman di luar jangkauan atau tidak valid = 404', async () => {
    const second = await render('kabar-tekno', '/?page=2')
    if (second.page.vm.view !== 'home') throw new Error('bukan home')
    expect(second.page.vm.featured).toEqual([])
    expect(second.page.vm.latest.map((a) => a.href)).toEqual(['/review/ponsel-lipat-makin-murah'])
    expect(second.page.vm.pagination).toMatchObject({ prevHref: '/', nextHref: null })
    expect((await render('kabar-tekno', '/?page=3')).status).toBe(404)
    expect((await render('kabar-tekno', '/?page=abc')).status).toBe(404)
  })

  // ---------- Section home (ADR-008) ----------
  const plan = (type: string, articles: ResolvedSection['articles'], props: Record<string, unknown> = {}): ResolvedSection => ({ type, props, articles })

  it('home dengan section: data per section, tanpa artikel ganda, tautan kategori/tag; pagination tetap', async () => {
    const { page, issues } = await render('kabar-tekno', '/', [
      plan('hero', { source: 'featured', limit: 1 }, { source: 'featured', limit: 1 }),
      plan('latest-grid', { source: 'latest', limit: 6 }),
      plan('category-strip', { source: 'category', slug: 'gadget', limit: 4 }),
      plan('tag-strip', { source: 'tag', slug: 'android', limit: 4 }),
      plan('note', null, { text: 'Halo' }),
    ])
    if (page.vm.view !== 'home') throw new Error('bukan home')
    expect(page.vm.sections.map((s) => [s.type, s.articles.map((a) => a.href), s.link])).toEqual([
      ['hero', ['/review/ponsel-lipat-makin-murah'], null],
      ['latest-grid', ['/kecerdasan-buatan/cara-kerja-model-bahasa'], null],
      // Ponsel ada di sub-kategori gadget dan bertag android, tetapi sudah tampil di hero.
      ['category-strip', [], { label: 'Gadget', href: '/category/gadget' }],
      ['tag-strip', [], { label: 'Android', href: '/tag/android' }],
      ['note', [], null],
    ])
    expect(page.vm.sections[0]?.props).toEqual({ source: 'featured', limit: 1 })
    expect(page.vm.featured).toEqual([])
    expect(page.vm.latest).toEqual([])
    // 2 artikel, pageSize 1: halaman 1 = section, halaman 2-3 = arsip.
    expect(page.vm.pagination).toMatchObject({ page: 1, totalPages: 3, nextHref: '/?page=2' })
    expect(issues).toEqual([])
  })

  it('section yang meminta lebih banyak tetap terisi setelah artikel ganda dibuang', async () => {
    const { page } = await render('kabar-tekno', '/', [
      plan('hero', { source: 'latest', limit: 1 }),
      plan('latest-grid', { source: 'latest', limit: 1 }),
    ])
    if (page.vm.view !== 'home') throw new Error('bukan home')
    expect(page.vm.sections.map((s) => s.articles.map((a) => a.href))).toEqual([
      ['/kecerdasan-buatan/cara-kerja-model-bahasa'],
      ['/review/ponsel-lipat-makin-murah'],
    ])
  })

  it('mode section: ?page=N adalah arsip dari artikel terbaru, jadi tidak ada artikel yang terlewat', async () => {
    const layout = [plan('hero', { source: 'featured', limit: 1 })]
    const pages = await Promise.all(['/?page=2', '/?page=3'].map((url) => render('kabar-tekno', url, layout)))
    const vms = pages.map(({ page }) => {
      if (page.vm.view !== 'home') throw new Error('bukan home')
      return page.vm
    })
    expect(vms.map((vm) => vm.sections)).toEqual([[], []])
    expect(vms.map((vm) => vm.latest.map((a) => a.href))).toEqual([['/kecerdasan-buatan/cara-kerja-model-bahasa'], ['/review/ponsel-lipat-makin-murah']])
    expect(vms[0]?.pagination).toMatchObject({ page: 2, totalPages: 3, prevHref: '/', nextHref: '/?page=3' })
    expect((await render('kabar-tekno', '/?page=4', layout)).status).toBe(404)
  })

  it('section berikutnya tetap terisi walau artikelnya sudah banyak dipakai section sebelumnya', async () => {
    const { page } = await render('kabar-tekno', '/', [
      plan('latest-grid', { source: 'latest', limit: 1 }),
      plan('latest-grid', { source: 'latest', limit: 1 }),
      plan('latest-grid', { source: 'latest', limit: 1 }),
    ])
    if (page.vm.view !== 'home') throw new Error('bukan home')
    expect(page.vm.sections.map((s) => s.articles.map((a) => a.href))).toEqual([
      ['/kecerdasan-buatan/cara-kerja-model-bahasa'],
      ['/review/ponsel-lipat-makin-murah'],
      [],
    ])
  })

  it('kategori atau tag tidak dikenal: section dilewati dan dicatat; tanpa section tersisa = daftar terbaru', async () => {
    const { page, issues } = await render('kabar-tekno', '/', [
      plan('category-strip', { source: 'category', slug: 'resep', limit: 4 }),
      plan('tag-strip', { source: 'tag', slug: 'tidak-ada', limit: 4 }),
    ])
    if (page.vm.view !== 'home') throw new Error('bukan home')
    expect(page.vm.sections).toEqual([])
    expect(page.vm.latest.map((a) => a.href)).toEqual(['/kecerdasan-buatan/cara-kerja-model-bahasa'])
    // Kategori "resep" milik site lain: tidak boleh terbaca dari site ini.
    expect(issues).toEqual([
      'section: kategori "resep" tidak ada di site ini, section dilewati',
      'section: tag "tidak-ada" tidak ada di site ini, section dilewati',
    ])
  })

  it('jumlah section dan limit dijaga ulang di core', async () => {
    const many = Array.from({ length: SECTION_LIMITS.maxSectionsPerPage + 4 }, () => plan('latest-grid', { source: 'latest', limit: 999 }))
    const { page } = await render('kabar-tekno', '/', many)
    if (page.vm.view !== 'home') throw new Error('bukan home')
    expect(page.vm.sections).toHaveLength(SECTION_LIMITS.maxSectionsPerPage)
    expect(page.vm.sections[0]?.articles).toHaveLength(2)
  })

  it('artikel: breadcrumb dengan induk kategori, tag, block body termasuk gambar', async () => {
    const { status, page, issues } = await render('kabar-tekno', '/review/ponsel-lipat-makin-murah')
    expect(status).toBe(200)
    if (page.vm.view !== 'article') throw new Error('bukan artikel')
    expect(page.vm.breadcrumb.map((b) => b.href)).toEqual(['/', '/category/gadget', '/category/review', '/review/ponsel-lipat-makin-murah'])
    expect(page.vm.tags).toEqual([{ label: 'Android', href: '/tag/android' }])
    expect(page.vm.blocks.map((b) => b.type)).toEqual(['paragraph', 'heading', 'list', 'image'])
    const img = page.vm.blocks.find((b) => b.type === 'image')
    expect(img).toMatchObject({ image: { src: expect.stringMatching(/^\/media\/kabar-tekno\//) } })
    expect(page.vm.publishedAt.label).toBe('10 November 2026')
    expect(issues).toEqual([])
  })

  it('artikel di path non-kanonik -> 301 ke permalink', async () => {
    expect(await build('kabar-tekno', '/gadget/ponsel-lipat-makin-murah')).toEqual({ kind: 'redirect', status: 301, location: '/review/ponsel-lipat-makin-murah' })
  })

  it('redirect dari tabel redirects sebelum 404', async () => {
    expect(await build('kabar-tekno', '/gadget/ponsel-lipat-murah')).toEqual({ kind: 'redirect', status: 301, location: '/review/ponsel-lipat-makin-murah' })
  })

  it('slash di ujung -> 301, query dipertahankan', async () => {
    expect(await build('kabar-tekno', '/category/gadget/?page=2')).toEqual({ kind: 'redirect', status: 301, location: '/category/gadget?page=2' })
  })

  it('kategori: termasuk subkategori, anak kategori, breadcrumb', async () => {
    const { page } = await render('kabar-tekno', '/category/gadget')
    if (page.vm.view !== 'category') throw new Error('bukan kategori')
    expect(page.vm).toMatchObject({ name: 'Gadget', children: [{ label: 'Review', href: '/category/review' }] })
    expect(page.vm.articles.map((a) => a.href)).toEqual(['/review/ponsel-lipat-makin-murah'])
    expect(page.vm.breadcrumb.map((b) => b.label)).toEqual(['Beranda', 'Gadget'])
  })

  it('tag, penulis, halaman statis', async () => {
    const tag = await render('kabar-tekno', '/tag/android')
    expect(tag.page.vm).toMatchObject({ view: 'tag', name: 'Android', articles: [{ href: '/review/ponsel-lipat-makin-murah' }] })
    const author = await render('kabar-tekno', '/author/budi-santoso')
    expect(author.page.vm).toMatchObject({ view: 'author', name: 'Budi Santoso', bio: 'Menulis soal gawai sejak 2015.' })
    const contact = await render('dapur-nusantara', '/p/kontak')
    expect(contact.page.vm).toEqual({ view: 'page', title: 'Kontak', viewKey: 'contact', blocks: [] })
  })

  it('pencarian: query dibersihkan, pagination membawa q, tanpa query = form kosong', async () => {
    const { page } = await render('kabar-tekno', '/search?q=%20ponsel%20')
    expect(page.vm).toMatchObject({ view: 'search', action: '/search', query: 'ponsel', articles: [{ href: '/review/ponsel-lipat-makin-murah' }] })
    const empty = await render('kabar-tekno', '/search')
    expect(empty.page.vm).toMatchObject({ view: 'search', query: '', articles: [] })
  })

  it.each([
    ['/category/tidak-ada'],
    ['/tag/pedas'], // tag milik site lain
    ['/p/kontak'], // halaman milik site lain
    ['/resep/rendang-padang-empuk'], // artikel milik site lain
    ['/kecerdasan-buatan/laptop-terbaik-mahasiswa-2030'], // terjadwal
    ['/gadget/draf-ulasan-earbuds'], // draf
    ['/apa/saja/ini'],
  ])('404 dengan chrome site: %s', async (path) => {
    const { status, page } = await render('kabar-tekno', path)
    expect(status).toBe(404)
    expect(page.vm).toEqual({ view: 'not-found', path })
    expect(page.chrome.site.name).toBe('Kabar Tekno')
  })

  it('SEO artikel: kolom seo konten menang, canonical absolut di domain primary, Open Graph lengkap', async () => {
    const { page } = await render('kabar-tekno', '/review/ponsel-lipat-makin-murah')
    expect(page.seo).toEqual({
      title: 'Ponsel lipat makin murah: layak dibeli? | Kabar Tekno',
      description: 'Checklist sebelum membeli ponsel lipat.',
      canonical: 'https://tekno.localhost/review/ponsel-lipat-makin-murah',
      robots: null,
      og: {
        type: 'article',
        title: 'Ponsel lipat makin murah: layak dibeli?',
        description: 'Checklist sebelum membeli ponsel lipat.',
        url: 'https://tekno.localhost/review/ponsel-lipat-makin-murah',
        image: { url: 'https://tekno.localhost/media/kabar-tekno/2026/11/hp.webp', alt: 'Ponsel lipat di atas meja', width: 1600, height: 900 },
        siteName: 'Kabar Tekno',
        locale: 'id_ID',
      },
      article: { publishedTime: '2026-11-10T01:00:00.000Z', modifiedTime: expect.any(String), section: 'Review', tags: ['Android'], author: 'Budi Santoso', citations: [] },
      jsonLd: expect.objectContaining({
        '@type': 'Article',
        headline: 'Ponsel lipat makin murah: layak dibeli?',
        datePublished: '2026-11-10T01:00:00.000Z',
        author: { '@type': 'Person', name: 'Budi Santoso' },
        publisher: { '@type': 'Organization', name: 'Kabar Tekno' },
      }),
      feedUrl: 'https://tekno.localhost/rss.xml',
      favicon: null,
    })
  })

  it('SEO home, listing, pencarian, 404', async () => {
    const home = (await render('kabar-tekno', '/')).page.seo
    expect(home).toMatchObject({ title: 'Kabar Tekno – Teknologi tanpa jargon', description: 'Berita dan ulasan teknologi.', canonical: 'https://tekno.localhost/', robots: null, og: { type: 'website', title: 'Kabar Tekno', image: null } })
    const second = (await render('kabar-tekno', '/?page=2')).page.seo
    expect(second).toMatchObject({ title: 'Kabar Tekno – Teknologi tanpa jargon – Halaman 2', canonical: 'https://tekno.localhost/?page=2' })
    expect((await render('kabar-tekno', '/category/gadget')).page.seo).toMatchObject({ title: 'Gadget | Kabar Tekno', canonical: 'https://tekno.localhost/category/gadget' })
    expect((await render('kabar-tekno', '/search?q=ponsel')).page.seo).toMatchObject({ title: 'Pencarian: ponsel | Kabar Tekno', robots: 'noindex, follow' })
    expect((await render('kabar-tekno', '/tidak/ada')).page.seo).toMatchObject({ title: 'Halaman tidak ditemukan | Kabar Tekno', canonical: null, robots: 'noindex, follow' })
    expect((await render('dapur-nusantara', '/p/kontak')).page.seo).toMatchObject({ title: 'Kontak - Dapur Nusantara', canonical: 'https://kuliner.localhost/p/kontak' })
  })

  it('site kedua memakai datanya sendiri', async () => {
    const { page } = await render('dapur-nusantara', '/sumatera/rendang-padang-empuk')
    expect(page.vm).toMatchObject({ view: 'article', category: { href: '/category/sumatera' }, tags: [{ href: '/tag/pedas' }, { href: '/tag/tradisional' }] })
    expect(page.chrome.menus['header']?.map((m) => m.label)).toEqual(['Beranda', 'Resep', 'Kuliner Daerah'])
  })
})

// Body rusak tanpa database: repository palsu mengembalikan satu artikel.
describe('body rusak dan embed', () => {
  const site: SiteInfo = {
    id: 'site-1', code: 'uji', name: 'Uji', defaultLocale: 'id-ID', timezone: 'Asia/Jakarta',
    settings: parseSiteSettings({}), logo: null, favicon: null,
  }
  const rawBody = {
    version: 1,
    blocks: [
      { type: 'paragraph', text: 'Pembuka' },
      { type: 'carousel', items: [] },
      { type: 'image', mediaId: 'bukan-uuid' },
      { type: 'image', mediaId: '01930000-0000-7000-8000-00000000ffff', caption: 'Hilang' },
      { type: 'embed', provider: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' },
      { type: 'embed', provider: 'x', url: 'https://x.com/a/status/1' },
      'bukan object',
    ],
  }
  const { body, skipped } = parseBodyLenient(rawBody)
  const article: ArticleDetail = {
    id: 'a1', title: 'Judul', slug: 'judul', excerpt: null, format: 'standard', isFeatured: false,
    publishedAt: new Date('2026-11-10T01:00:00Z'), updatedAt: new Date('2026-11-10T01:00:00Z'),
    category: { id: 'c1', name: 'Umum', slug: 'umum' }, categoryParent: null, author: null,
    featuredMedia: null, tags: [], attributes: {}, seo: { title: 123 }, body, bodyIssues: skipped, references: [],
  }
  const content = {
    getPublishedArticle: async (_siteId: string, slug: string) => (slug === 'judul' ? article : null),
    getMediaByIds: async () => [],
    findRedirect: async () => null,
  }
  const menus = { getMenuTree: async () => null }
  const builder = createPageBuilder({ content, menus } as never, { mediaUrl: createMediaUrlResolver(), now: () => NOW })

  it('block yang tidak dikenal atau rusak dilewati dan dicatat; halaman tetap 200', async () => {
    const result = await builder.build({ site, pathname: '/umum/judul', searchParams: new URLSearchParams(), origin: 'https://uji.test' })
    if (result.kind !== 'render') throw new Error('bukan render')
    expect(result.status).toBe(200)
    if (result.page.vm.view !== 'article') throw new Error('bukan artikel')
    expect(result.page.vm.blocks).toEqual([
      { type: 'paragraph', text: 'Pembuka' },
      { type: 'embed', provider: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ', embedSrc: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' },
      { type: 'embed', provider: 'x', url: 'https://x.com/a/status/1', embedSrc: null },
    ])
    expect(result.issues).toEqual([
      'artikel judul: block #1 (carousel) dilewati: tipe block tidak dikenal',
      'artikel judul: block #2 (image) dilewati: isi block tidak valid',
      'artikel judul: block #6 (tanpa tipe) dilewati: tipe block tidak dikenal',
      'artikel judul: block image dilewati: media 01930000-0000-7000-8000-00000000ffff tidak ada di site ini',
    ])
    // seo.title bukan string: diabaikan, judul artikel dipakai.
    expect(result.page.seo.title).toBe('Judul | Uji')
  })
})
