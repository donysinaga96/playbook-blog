// Test repository terhadap database dev yang di-seed (pnpm db:up), sebagai
// role aplikasi blog_app. Dilewati bila DATABASE_URL tidak ada.
//
// Dua jenis test:
//  1. Perilaku terhadap data seed (read-only).
//  2. Isolasi antar-site: setiap fungsi wajib menerima siteId, dan data
//     site lain tidak pernah terbaca.
// Aturan yang tidak tercakup seed (HIDDEN, nonaktif, SUSPENDED, body rusak)
// diuji dengan site sementara yang dihapus setelah test; test lain tidak terpengaruh.
import { randomBytes, randomUUID } from 'node:crypto'
import {
  articleTags,
  articles,
  authors,
  categories,
  createDatabase,
  eq,
  menuItems,
  menus,
  pages,
  siteDomains,
  sites,
  tags,
} from '@framework/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRepositories, type MenuNode } from './index'

const hasDb = Boolean(process.env['DATABASE_URL'])
const A = '01930000-0000-7000-8000-000000000101' // kabar-tekno
const B = '01930000-0000-7000-8000-000000000102' // dapur-nusantara
const NOW = new Date('2026-11-17T00:00:00Z')
const FUTURE = new Date('2031-01-01T00:00:00Z')

const slugs = <T extends { slug: string }>(rows: T[]) => rows.map((r) => r.slug)
const labels = (nodes: { label: string }[]) => nodes.map((n) => n.label)

describe.skipIf(!hasDb)('repository (database dev, role blog_app)', () => {
  const db = createDatabase({ connectionString: process.env['DATABASE_URL'] ?? '', max: 3, applicationName: 'vitest-repo' })
  const repos = createRepositories(db, { now: () => NOW })
  const { sites: siteRepo, content, menus: menuRepo } = repos
  afterAll(() => db.$client.end())

  describe('site: resolver dan theme', () => {
    it('Host -> site, termasuk logo dan settings tervalidasi', async () => {
      const r = await siteRepo.findByDomain('tekno.local.test')
      expect(r).toMatchObject({ matchedDomain: 'tekno.local.test', primaryDomain: 'tekno.local.test', isPrimary: true })
      expect(r?.site).toMatchObject({ id: A, code: 'kabar-tekno', name: 'Kabar Tekno', timezone: 'Asia/Jakarta' })
      expect(r?.site.settings.seo.titleTemplate).toBe('%s | Kabar Tekno')
      expect(r?.site.logo?.storageKey).toBe('kabar-tekno/logo.svg')
    })

    it('alias www ditemukan, ditandai bukan primary, dan menyebut domain primary', async () => {
      const r = await siteRepo.findByDomain('WWW.Tekno.Local.Test:8080')
      expect(r).toMatchObject({ matchedDomain: 'www.tekno.local.test', primaryDomain: 'tekno.local.test', isPrimary: false })
      expect(r?.site.id).toBe(A)
    })

    it('domain site lain tidak tertukar (logo juga milik site sendiri)', async () => {
      const r = await siteRepo.findByDomain('kuliner.local.test')
      expect(r?.site).toMatchObject({ id: B, code: 'dapur-nusantara' })
      expect(r?.site.logo?.storageKey).toBe('dapur-nusantara/logo.svg')
    })

    it.each(['tidak-ada.local.test', '', 'localhost', 'tekno.local.test/x'])('host %j tidak ditemukan', async (host) => {
      expect(await siteRepo.findByDomain(host)).toBeNull()
    })

    it('kode site (mode single-site)', async () => {
      expect((await siteRepo.findByCode('dapur-nusantara'))?.id).toBe(B)
      expect(await siteRepo.findByCode('tidak-ada')).toBeNull()
    })

    it('theme aktif per site; config template nonaktif tidak ikut', async () => {
      const a = await siteRepo.getActiveTheme(A)
      expect(a).toMatchObject({ templateKey: 'magazine', templateVersion: '1.0.0' })
      expect(a?.tokens).toMatchObject({ color: { primary: '#0f62fe' } })

      // Site B menyimpan baris magazine (nonaktif) selain news (aktif).
      const b = await siteRepo.getActiveTheme(B)
      expect(b).toMatchObject({ templateKey: 'news', templateVersion: '1.0.0' })
      expect(b?.layouts).toHaveProperty('home')

      expect(await siteRepo.getActiveTheme(randomUUID())).toBeNull()
    })
  })

  describe('artikel publik', () => {
    it('feed: terbaru dulu, tanpa draft dan artikel terjadwal', async () => {
      const a = await content.listPublishedArticles(A)
      expect(slugs(a.items)).toEqual(['cara-kerja-model-bahasa', 'ponsel-lipat-makin-murah'])
      expect(a).toMatchObject({ total: 2, page: 1, totalPages: 1 })

      const b = await content.listPublishedArticles(B)
      expect(slugs(b.items)).toEqual(['sambal-matah-10-menit', 'rendang-padang-empuk'])
    })

    it('artikel terjadwal muncul begitu waktunya lewat (tanpa queue)', async () => {
      const later = createRepositories(db, { now: () => FUTURE })
      const feed = await later.content.listPublishedArticles(A)
      expect(slugs(feed.items)).toEqual(['laptop-terbaik-mahasiswa-2030', 'cara-kerja-model-bahasa', 'ponsel-lipat-makin-murah'])
      // Draft tetap tidak pernah muncul.
      expect(slugs(feed.items)).not.toContain('draf-ulasan-earbuds')
    })

    it('ringkasan memuat kategori, penulis, media (titik fokus), tag, dan attributes', async () => {
      const { items } = await content.listPublishedArticles(A, { categorySlug: 'review' })
      expect(items).toHaveLength(1)
      expect(items[0]).toMatchObject({
        title: 'Ponsel lipat makin murah, layak dibeli?',
        isFeatured: true,
        category: { slug: 'review', name: 'Review' },
        author: { slug: 'budi-santoso', name: 'Budi Santoso' },
        featuredMedia: { storageKey: 'kabar-tekno/2026/11/hp.webp', width: 1600, height: 900, focalX: 0.62, focalY: 0.4 },
        tags: [{ slug: 'android', name: 'Android' }],
      })
      expect(items[0]?.attributes).toMatchObject({ review: { rating: 4.2 } })
      expect(items[0]?.publishedAt).toBeInstanceOf(Date)
    })

    it('paginasi', async () => {
      const p1 = await content.listPublishedArticles(A, { pageSize: 1 })
      expect(slugs(p1.items)).toEqual(['cara-kerja-model-bahasa'])
      expect(p1).toMatchObject({ total: 2, totalPages: 2 })

      const p2 = await content.listPublishedArticles(A, { page: 2, pageSize: 1 })
      expect(slugs(p2.items)).toEqual(['ponsel-lipat-makin-murah'])

      const p3 = await content.listPublishedArticles(A, { page: 3, pageSize: 1 })
      expect(p3.items).toEqual([])
      expect(p3).toMatchObject({ total: 2, totalPages: 2 })
    })

    it('filter kategori mencakup sub-kategori', async () => {
      expect(slugs((await content.listPublishedArticles(A, { categorySlug: 'gadget' })).items)).toEqual(['ponsel-lipat-makin-murah'])
      expect(slugs((await content.listPublishedArticles(B, { categorySlug: 'kuliner-daerah' })).items)).toEqual(['rendang-padang-empuk'])
      expect(slugs((await content.listPublishedArticles(B, { categorySlug: 'sumatera' })).items)).toEqual(['rendang-padang-empuk'])
    })

    it('filter tag, penulis, dan featured', async () => {
      expect(slugs((await content.listPublishedArticles(A, { tagSlug: 'android' })).items)).toEqual(['ponsel-lipat-makin-murah'])
      expect(slugs((await content.listPublishedArticles(B, { tagSlug: 'pedas' })).items)).toEqual(['rendang-padang-empuk'])
      expect(slugs((await content.listPublishedArticles(A, { authorSlug: 'budi-santoso' })).items)).toEqual(['ponsel-lipat-makin-murah'])
      expect(slugs((await content.listPublishedArticles(A, { featuredOnly: true })).items)).toEqual(['ponsel-lipat-makin-murah'])
      expect(slugs((await content.listPublishedArticles(B, { featuredOnly: true })).items)).toEqual(['rendang-padang-empuk'])
    })

    it('filter dengan slug tidak dikenal menghasilkan halaman kosong, bukan error', async () => {
      for (const q of [{ categorySlug: 'x' }, { tagSlug: 'x' }, { authorSlug: 'x' }]) {
        expect(await content.listPublishedArticles(A, q)).toMatchObject({ items: [], total: 0, totalPages: 0 })
      }
    })

    it('detail artikel: body, seo, breadcrumb kategori', async () => {
      const a = await content.getPublishedArticle(A, 'ponsel-lipat-makin-murah')
      expect(a?.body.blocks.map((b) => b.type)).toEqual(['paragraph', 'heading', 'list', 'image'])
      expect(a?.bodyIssues).toEqual([])
      expect(a?.seo).toMatchObject({ title: 'Ponsel lipat makin murah: layak dibeli?' })
      expect(a?.category.slug).toBe('review')
      expect(a?.categoryParent).toMatchObject({ slug: 'gadget' })
      expect(a?.updatedAt).toBeInstanceOf(Date)

      const root = await content.getPublishedArticle(A, 'cara-kerja-model-bahasa')
      expect(root?.categoryParent).toBeNull()
    })

    it('detail: draft dan terjadwal tidak bisa dibuka; terjadwal bisa setelah waktunya', async () => {
      expect(await content.getPublishedArticle(A, 'draf-ulasan-earbuds')).toBeNull()
      expect(await content.getPublishedArticle(A, 'laptop-terbaik-mahasiswa-2030')).toBeNull()
      const later = createRepositories(db, { now: () => FUTURE })
      expect((await later.content.getPublishedArticle(A, 'laptop-terbaik-mahasiswa-2030'))?.title).toBe('Laptop terbaik untuk mahasiswa 2030')
      expect(await later.content.getPublishedArticle(A, 'draf-ulasan-earbuds')).toBeNull()
    })

    it('pencarian per site', async () => {
      expect(slugs((await content.searchPublishedArticles(B, 'rendang')).items)).toEqual(['rendang-padang-empuk'])
      expect(slugs((await content.searchPublishedArticles(A, 'ponsel lipat')).items)).toEqual(['ponsel-lipat-makin-murah'])
      expect((await content.searchPublishedArticles(A, 'rendang')).total).toBe(0)
      expect((await content.searchPublishedArticles(B, 'ponsel')).total).toBe(0)
    })

    it.each(['', '   ', '"', '& | ! (', "'; DROP TABLE articles; --", 'a'.repeat(1000)])(
      'pencarian dengan input aneh %j tidak melempar error',
      async (q) => {
        await expect(content.searchPublishedArticles(A, q)).resolves.toMatchObject({ page: 1 })
      },
    )
  })

  describe('halaman, kategori, tag, penulis, redirect', () => {
    it('halaman dengan slug sama di dua site tidak tertukar', async () => {
      const a = await content.getPublishedPage(A, 'tentang-kami')
      const b = await content.getPublishedPage(B, 'tentang-kami')
      expect(JSON.stringify(a?.body)).toContain('Kabar Tekno')
      expect(JSON.stringify(b?.body)).toContain('Dapur Nusantara')
      expect(a?.id).not.toBe(b?.id)
    })

    it('halaman hanya ada di satu site', async () => {
      expect(await content.getPublishedPage(A, 'kontak')).toBeNull()
      expect(await content.getPublishedPage(B, 'kontak')).toMatchObject({ title: 'Kontak', viewKey: 'contact' })
    })

    it('pohon kategori per site', async () => {
      const tree = (nodes: Awaited<ReturnType<typeof content.getCategoryTree>>): unknown =>
        nodes.map((n) => [n.slug, tree(n.children)])
      expect(tree(await content.getCategoryTree(A))).toEqual([['gadget', [['review', []]]], ['kecerdasan-buatan', []]])
      expect(tree(await content.getCategoryTree(B))).toEqual([['resep', []], ['kuliner-daerah', [['sumatera', []]]]])
    })

    it('detail kategori memuat induk dan anak; kategori site lain tidak ada', async () => {
      expect(await content.getCategory(A, 'review')).toMatchObject({ parent: { slug: 'gadget' }, children: [] })
      expect(slugs((await content.getCategory(A, 'gadget'))?.children ?? [])).toEqual(['review'])
      expect(await content.getCategory(A, 'sumatera')).toBeNull()
    })

    it('tag dan penulis; slug yang sama ("redaksi") di dua site tidak tertukar', async () => {
      expect(await content.getTag(A, 'android')).toMatchObject({ name: 'Android' })
      expect(await content.getTag(A, 'pedas')).toBeNull()
      const a = await content.getAuthor(A, 'redaksi')
      const b = await content.getAuthor(B, 'redaksi')
      expect(a?.name).toBe('Redaksi Kabar Tekno')
      expect(b?.name).toBe('Redaksi Dapur')
      expect(a?.id).not.toBe(b?.id)
      expect(slugs((await content.listPublishedArticles(A, { authorSlug: 'redaksi' })).items)).toEqual(['cara-kerja-model-bahasa'])
      expect(slugs((await content.listPublishedArticles(B, { authorSlug: 'redaksi' })).items)).toEqual(['sambal-matah-10-menit', 'rendang-padang-empuk'])
    })

    it('redirect: cocok walau ada slash di ujung atau query; hanya untuk site pemiliknya', async () => {
      const expected = { toPath: '/review/ponsel-lipat-makin-murah', statusCode: 301 }
      expect(await content.findRedirect(A, '/gadget/ponsel-lipat-murah')).toEqual(expected)
      expect(await content.findRedirect(A, '/gadget/ponsel-lipat-murah/?utm_source=x')).toEqual(expected)
      expect(await content.findRedirect(B, '/gadget/ponsel-lipat-murah')).toBeNull()
      expect(await content.findRedirect(A, '//evil.test/x')).toBeNull()
      expect(await content.findRedirect(A, '/tidak-ada')).toBeNull()
    })
  })

  describe('menu', () => {
    const shape = (nodes: MenuNode[]): unknown =>
      nodes.map((n) => [n.label, n.target.type, shape(n.children)])

    it('menu header sebagai pohon dengan tujuan ter-resolve', async () => {
      const a = await menuRepo.getMenuTree(A, 'header')
      expect(a?.name).toBe('Menu utama')
      expect(shape(a?.items ?? [])).toEqual([
        ['Beranda', 'ROUTE', []],
        ['Gadget', 'CATEGORY', [['Review', 'CATEGORY', []]]],
        ['AI', 'CATEGORY', []],
      ])
      expect(a?.items[1]?.target).toEqual({ type: 'CATEGORY', slug: 'gadget', name: 'Gadget' })
      expect(a?.items[0]?.target).toEqual({ type: 'ROUTE', path: '/' })

      const b = await menuRepo.getMenuTree(B, 'header')
      expect(shape(b?.items ?? [])).toEqual([
        ['Beranda', 'ROUTE', []],
        ['Resep', 'CATEGORY', []],
        ['Kuliner Daerah', 'CATEGORY', [['Sumatera', 'CATEGORY', []]]],
      ])
    })

    it('menu footer: halaman dan URL eksternal', async () => {
      const a = await menuRepo.getMenuTree(A, 'footer')
      expect(a?.items.map((i) => i.target)).toEqual([
        { type: 'PAGE', slug: 'tentang-kami', title: 'Tentang Kami' },
        { type: 'URL', url: 'https://x.com/kabartekno' },
      ])
      expect(labels((await menuRepo.getMenuTree(B, 'footer'))?.items ?? [])).toEqual(['Kontak'])
    })

    it('lokasi tanpa menu -> null', async () => {
      expect(await menuRepo.getMenuTree(A, 'sidebar')).toBeNull()
    })
  })

  describe('isolasi antar-site', () => {
    // Setiap fungsi repository konten dan menu WAJIB muncul di sini. Menambah
    // fungsi baru tanpa mendaftarkannya membuat test pertama gagal.
    const args: Record<string, unknown[]> = {
      listPublishedArticles: [{}],
      searchPublishedArticles: ['ponsel rendang'],
      getPublishedArticle: ['ponsel-lipat-makin-murah'],
      getPublishedPage: ['tentang-kami'],
      getCategoryTree: [],
      getCategory: ['review'],
      getTag: ['android'],
      getAuthor: ['redaksi'],
      findRedirect: ['/gadget/ponsel-lipat-murah'],
      getMediaByIds: [['01930000-0000-7000-8000-000000000202', '01930000-0000-7000-8000-000000000212']],
      listSitemapEntries: [],
      getMenuTree: ['header'],
    }
    const fns = { ...content, ...menuRepo } as unknown as Record<string, (siteId: string, ...a: unknown[]) => Promise<unknown>>

    it('setiap fungsi terdaftar dan menerima siteId sebagai argumen pertama', () => {
      expect(Object.keys(fns).sort()).toEqual(Object.keys(args).sort())
      for (const fn of Object.values(fns)) expect(fn.length).toBeGreaterThanOrEqual(1)
    })

    it('site yang tidak ada tidak pernah menghasilkan data apa pun', async () => {
      const ghost = randomUUID()
      for (const [name, fn] of Object.entries(fns)) {
        const result = await fn(ghost, ...(args[name] ?? []))
        const empty =
          result === null ||
          (Array.isArray(result) && result.length === 0) ||
          // Object berisi daftar (listSitemapEntries): semua daftar kosong.
          (typeof result === 'object' && !('items' in (result as object)) && !Array.isArray(result)
            && Object.values(result as object).every((v) => Array.isArray(v) && v.length === 0)) ||
          (typeof result === 'object' && 'items' in (result as object) && (result as { items: unknown[] }).items.length === 0)
        expect(empty, `${name}(siteId tidak ada) mengembalikan data`).toBe(true)
      }
    })

    // Kumpulkan semua id milik satu site langsung dari tabel, lalu pastikan
    // hasil repository site lain tidak memuat satu pun.
    async function idsOf(siteId: string): Promise<Set<string>> {
      const [a, c, au, t, p, m, mi] = await Promise.all([
        db.select({ id: articles.id }).from(articles).where(eq(articles.siteId, siteId)),
        db.select({ id: categories.id }).from(categories).where(eq(categories.siteId, siteId)),
        db.select({ id: authors.id }).from(authors).where(eq(authors.siteId, siteId)),
        db.select({ id: tags.id }).from(tags).where(eq(tags.siteId, siteId)),
        db.select({ id: pages.id }).from(pages).where(eq(pages.siteId, siteId)),
        db.select({ id: menus.id }).from(menus).where(eq(menus.siteId, siteId)),
        db.select({ id: menuItems.id }).from(menuItems).where(eq(menuItems.siteId, siteId)),
      ])
      return new Set([...a, ...c, ...au, ...t, ...p, ...m, ...mi].map((r) => r.id))
    }

    function collectIds(value: unknown, out: Set<string> = new Set()): Set<string> {
      if (Array.isArray(value)) value.forEach((v) => collectIds(v, out))
      else if (value && typeof value === 'object' && !(value instanceof Date)) {
        for (const [k, v] of Object.entries(value)) {
          if (k === 'id' && typeof v === 'string') out.add(v)
          else collectIds(v, out)
        }
      }
      return out
    }

    async function everythingFor(siteId: string) {
      const results: unknown[] = []
      const feed = await content.listPublishedArticles(siteId, { pageSize: 50 })
      results.push(feed)
      for (const q of [{ featuredOnly: true }, { categorySlug: 'gadget' }, { categorySlug: 'resep' }, { tagSlug: 'android' }, { tagSlug: 'pedas' }, { authorSlug: 'redaksi' }]) {
        results.push(await content.listPublishedArticles(siteId, { ...q, pageSize: 50 }))
      }
      for (const q of ['ponsel', 'rendang', 'sambal', 'laptop']) results.push(await content.searchPublishedArticles(siteId, q))
      for (const slug of ['ponsel-lipat-makin-murah', 'cara-kerja-model-bahasa', 'rendang-padang-empuk', 'sambal-matah-10-menit']) {
        results.push(await content.getPublishedArticle(siteId, slug))
      }
      for (const slug of ['tentang-kami', 'kontak']) results.push(await content.getPublishedPage(siteId, slug))
      results.push(await content.getCategoryTree(siteId))
      for (const slug of ['gadget', 'review', 'kecerdasan-buatan', 'resep', 'kuliner-daerah', 'sumatera']) results.push(await content.getCategory(siteId, slug))
      for (const slug of ['android', 'laptop', 'pedas', 'tradisional']) results.push(await content.getTag(siteId, slug))
      for (const slug of ['redaksi', 'budi-santoso']) results.push(await content.getAuthor(siteId, slug))
      for (const loc of ['header', 'footer']) results.push(await menuRepo.getMenuTree(siteId, loc))
      results.push(await content.listSitemapEntries(siteId))
      // Id media kedua site sekaligus: hanya milik pembaca yang kembali.
      results.push(await content.getMediaByIds(siteId, ['01930000-0000-7000-8000-000000000202', '01930000-0000-7000-8000-000000000212']))
      return results
    }

    it.each([
      ['A membaca', A, B],
      ['B membaca', B, A],
    ])('%s: tidak ada id milik site lain di hasil mana pun', async (_label, self, other) => {
      const foreign = await idsOf(other)
      expect(foreign.size).toBeGreaterThan(10)

      const seen = collectIds(await everythingFor(self))
      expect(seen.size).toBeGreaterThan(10) // memastikan test benar-benar membaca data
      for (const id of seen) {
        expect(foreign.has(id), `id ${id} milik site lain muncul`).toBe(false)
      }
    })

    it('listSitemapEntries: hanya konten tampil; tag/penulis tanpa artikel tampil tidak ikut', async () => {
      const a = await content.listSitemapEntries(A)
      // laptop-terbaik-mahasiswa-2030 terjadwal, draf-ulasan-earbuds DRAFT: tidak ikut.
      expect(a.articles.map((x) => [x.categorySlug, x.slug])).toEqual([
        ['kecerdasan-buatan', 'cara-kerja-model-bahasa'],
        ['review', 'ponsel-lipat-makin-murah'],
      ])
      expect(a.pages.map((x) => x.slug)).toEqual(['tentang-kami'])
      expect(a.categories.map((x) => x.slug)).toEqual(['gadget', 'kecerdasan-buatan', 'review'])
      // tag laptop hanya dipakai artikel terjadwal.
      expect(a.tags.map((x) => x.slug)).toEqual(['android'])
      expect(a.authors.map((x) => x.slug)).toEqual(['budi-santoso', 'redaksi'])
    })

    it('getMediaByIds hanya mengembalikan media site pembaca', async () => {
      const ids = ['01930000-0000-7000-8000-000000000202', '01930000-0000-7000-8000-000000000212', randomUUID()]
      expect((await content.getMediaByIds(A, ids)).map((m) => m.storageKey)).toEqual(['kabar-tekno/2026/11/hp.webp'])
      expect((await content.getMediaByIds(B, ids)).map((m) => m.storageKey)).toEqual(['dapur-nusantara/2026/11/rendang.webp'])
      expect(await content.getMediaByIds(A, [])).toEqual([])
    })

    it('media (gambar unggulan dan logo) selalu milik site pembacanya', async () => {
      const a = await content.listPublishedArticles(A)
      const b = await content.listPublishedArticles(B)
      for (const m of a.items.map((i) => i.featuredMedia).filter(Boolean)) expect(m?.storageKey.startsWith('kabar-tekno/')).toBe(true)
      for (const m of b.items.map((i) => i.featuredMedia).filter(Boolean)) expect(m?.storageKey.startsWith('dapur-nusantara/')).toBe(true)
    })
  })

  // -------------------------------------------------------------------
  // Aturan yang tidak ada di seed: site sementara.
  // -------------------------------------------------------------------
  describe('aturan tampil dan status (site sementara)', () => {
    const code = `fx-${randomBytes(4).toString('hex')}`
    const fx = { siteId: '', suspendedId: '' }
    const past = new Date('2026-01-01T00:00:00Z')

    beforeAll(async () => {
      const [site] = await db.insert(sites).values({ code, name: 'Fixture' }).returning({ id: sites.id })
      const siteId = (fx.siteId = site?.id ?? '')
      const [suspended] = await db
        .insert(sites)
        .values({ code: `${code}-s`, name: 'Suspended', status: 'SUSPENDED' })
        .returning({ id: sites.id })
      fx.suspendedId = suspended?.id ?? ''

      await db.insert(siteDomains).values([
        { siteId, domain: `${code}.local.test`, isPrimary: true },
        { siteId, domain: `pending-${code}.local.test`, status: 'PENDING' },
        { siteId: fx.suspendedId, domain: `${code}-s.local.test`, isPrimary: true },
      ])

      const cats = await db
        .insert(categories)
        .values([
          { siteId, name: 'Terbuka', slug: 'terbuka' },
          { siteId, name: 'Rahasia', slug: 'rahasia', status: 'HIDDEN' },
        ])
        .returning({ id: categories.id, slug: categories.slug })
      const cat = (slug: string) => cats.find((c) => c.slug === slug)?.id ?? ''

      const auth = await db
        .insert(authors)
        .values([
          { siteId, name: 'Terlihat', slug: 'terlihat' },
          { siteId, name: 'Disembunyikan', slug: 'disembunyikan', status: 'HIDDEN' },
        ])
        .returning({ id: authors.id, slug: authors.slug })
      const author = (slug: string) => auth.find((a) => a.slug === slug)?.id ?? ''

      const arts = await db
        .insert(articles)
        .values([
          { siteId, categoryId: cat('terbuka'), authorId: author('disembunyikan'), title: 'Penulis tersembunyi', slug: 'penulis-tersembunyi', status: 'PUBLISHED', publishedAt: past },
          { siteId, categoryId: cat('rahasia'), title: 'Di kategori tersembunyi', slug: 'di-kategori-tersembunyi', status: 'PUBLISHED', publishedAt: past },
          { siteId, categoryId: cat('terbuka'), title: 'Review', slug: 'dalam-review', status: 'REVIEW' },
          { siteId, categoryId: cat('terbuka'), title: 'Arsip', slug: 'diarsipkan', status: 'ARCHIVED' },
          {
            siteId,
            categoryId: cat('terbuka'),
            title: 'Body rusak',
            slug: 'body-rusak',
            status: 'PUBLISHED',
            publishedAt: past,
            body: { version: 1, blocks: [{ type: 'paragraph', text: 'masih terbaca' }, { type: 'hologram', data: 1 }] },
          },
        ])
        .returning({ id: articles.id, slug: articles.slug })
      void arts

      const [tagRow] = await db.insert(tags).values({ siteId, name: 'Uji', slug: 'uji' }).returning({ id: tags.id })
      const bodyRusak = arts.find((a) => a.slug === 'body-rusak')
      if (tagRow && bodyRusak) await db.insert(articleTags).values({ siteId, articleId: bodyRusak.id, tagId: tagRow.id })

      const pageRows = await db
        .insert(pages)
        .values([
          { siteId, title: 'Terbit', slug: 'terbit', status: 'PUBLISHED', publishedAt: past },
          { siteId, title: 'Draft', slug: 'draft', status: 'DRAFT' },
          { siteId, title: 'Terjadwal', slug: 'terjadwal', status: 'PUBLISHED', publishedAt: FUTURE },
        ])
        .returning({ id: pages.id, slug: pages.slug })
      const page = (slug: string) => pageRows.find((p) => p.slug === slug)?.id ?? ''

      const [menu] = await db.insert(menus).values({ siteId, location: 'header', name: 'Header' }).returning({ id: menus.id })
      const menuId = menu?.id ?? ''
      const top = await db
        .insert(menuItems)
        .values([
          { siteId, menuId, label: 'Aktif', itemType: 'CATEGORY', categoryId: cat('terbuka'), sortOrder: 1 },
          { siteId, menuId, label: 'Nonaktif', itemType: 'CATEGORY', categoryId: cat('terbuka'), sortOrder: 2, isActive: false },
          { siteId, menuId, label: 'Kategori tersembunyi', itemType: 'CATEGORY', categoryId: cat('rahasia'), sortOrder: 3 },
          { siteId, menuId, label: 'Halaman draft', itemType: 'PAGE', pageId: page('draft'), sortOrder: 4 },
          { siteId, menuId, label: 'Halaman terjadwal', itemType: 'PAGE', pageId: page('terjadwal'), sortOrder: 5 },
          { siteId, menuId, label: 'Halaman terbit', itemType: 'PAGE', pageId: page('terbit'), sortOrder: 6 },
        ])
        .returning({ id: menuItems.id, label: menuItems.label })
      const hidden = top.find((t) => t.label === 'Kategori tersembunyi')
      const inactive = top.find((t) => t.label === 'Nonaktif')
      if (hidden && inactive) {
        await db.insert(menuItems).values([
          { siteId, menuId, parentId: hidden.id, label: 'Anak dari tersembunyi', itemType: 'ROUTE', url: '/x', sortOrder: 1 },
          { siteId, menuId, parentId: inactive.id, label: 'Anak dari nonaktif', itemType: 'ROUTE', url: '/y', sortOrder: 1 },
        ])
      }
    })

    afterAll(async () => {
      // Hapus site sementara; semua datanya ikut terhapus (ON DELETE CASCADE).
      for (const id of [fx.siteId, fx.suspendedId]) if (id) await db.delete(sites).where(eq(sites.id, id))
    })

    it('site SUSPENDED atau domain PENDING tidak bisa di-resolve', async () => {
      expect((await siteRepo.findByDomain(`${code}.local.test`))?.site.id).toBe(fx.siteId)
      expect(await siteRepo.findByDomain(`pending-${code}.local.test`)).toBeNull()
      expect(await siteRepo.findByDomain(`${code}-s.local.test`)).toBeNull()
      expect(await siteRepo.findByCode(`${code}-s`)).toBeNull()
    })

    it('hanya artikel PUBLISHED yang sudah terbit masuk feed (REVIEW dan ARCHIVED tidak)', async () => {
      const feed = await content.listPublishedArticles(fx.siteId)
      expect(slugs(feed.items).sort()).toEqual(['body-rusak', 'di-kategori-tersembunyi', 'penulis-tersembunyi'])
      expect(await content.getPublishedArticle(fx.siteId, 'dalam-review')).toBeNull()
      expect(await content.getPublishedArticle(fx.siteId, 'diarsipkan')).toBeNull()
    })

    it('penulis HIDDEN: byline kosong, tidak bisa dibuka, filternya kosong; artikel tetap tampil', async () => {
      const a = await content.getPublishedArticle(fx.siteId, 'penulis-tersembunyi')
      expect(a?.author).toBeNull()
      expect(await content.getAuthor(fx.siteId, 'disembunyikan')).toBeNull()
      expect((await content.getAuthor(fx.siteId, 'terlihat'))?.name).toBe('Terlihat')
      expect((await content.listPublishedArticles(fx.siteId, { authorSlug: 'disembunyikan' })).total).toBe(0)
    })

    it('kategori HIDDEN: tidak ada di pohon/detail/filter; artikelnya tetap bisa dibuka lewat slug', async () => {
      expect((await content.getCategoryTree(fx.siteId)).map((c) => c.slug)).toEqual(['terbuka'])
      expect(await content.getCategory(fx.siteId, 'rahasia')).toBeNull()
      expect((await content.listPublishedArticles(fx.siteId, { categorySlug: 'rahasia' })).total).toBe(0)
      expect((await content.getPublishedArticle(fx.siteId, 'di-kategori-tersembunyi'))?.category.slug).toBe('rahasia')
    })

    it('body dengan block tidak dikenal: artikel tetap tampil, block dilewati dan dilaporkan', async () => {
      const a = await content.getPublishedArticle(fx.siteId, 'body-rusak')
      expect(a?.body.blocks).toEqual([{ type: 'paragraph', text: 'masih terbaca' }])
      expect(a?.bodyIssues).toEqual([{ index: 1, type: 'hologram', reason: 'tipe block tidak dikenal' }])
      expect(a?.tags.map((t) => t.slug)).toEqual(['uji'])
    })

    it('halaman: hanya yang PUBLISHED dan sudah terbit', async () => {
      expect((await content.getPublishedPage(fx.siteId, 'terbit'))?.title).toBe('Terbit')
      expect(await content.getPublishedPage(fx.siteId, 'draft')).toBeNull()
      expect(await content.getPublishedPage(fx.siteId, 'terjadwal')).toBeNull()
      const later = createRepositories(db, { now: () => FUTURE })
      expect((await later.content.getPublishedPage(fx.siteId, 'terjadwal'))?.title).toBe('Terjadwal')
    })

    it('menu: item nonaktif, tujuan tidak tampil, dan seluruh turunannya dibuang', async () => {
      const menu = await menuRepo.getMenuTree(fx.siteId, 'header')
      expect(labels(menu?.items ?? [])).toEqual(['Aktif', 'Halaman terbit'])
    })

    it('menu: halaman terjadwal muncul setelah waktunya', async () => {
      const later = createRepositories(db, { now: () => FUTURE })
      const menu = await later.menus.getMenuTree(fx.siteId, 'header')
      expect(labels(menu?.items ?? [])).toEqual(['Aktif', 'Halaman terjadwal', 'Halaman terbit'])
    })
  })
})
