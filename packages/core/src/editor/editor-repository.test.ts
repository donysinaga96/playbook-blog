// Repository tulis admin terhadap database dev (dilewati tanpa DATABASE_URL).
//
// Test ini MENULIS, sementara file test lain membaca data seed secara
// paralel. Karena itu semua tulisan terjadi di site uji sendiri (status
// ARCHIVED: tidak ditemukan resolver dan tidak muncul di daftar site admin),
// yang dibuat di beforeAll dan dihapus di afterAll beserta seluruh isinya
// (CASCADE). Site seed dapur-nusantara hanya dibaca, sebagai "site lain".
import { articles, authors, categories, createDatabase, eq, media, menus, sites, tags } from '@framework/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRepositories } from '../repositories'
import { EditorError } from './errors'

// Site lain (seed, hanya dibaca).
const OTHER = '01930000-0000-7000-8000-000000000102'
const OTHER_CATEGORY = '01930000-0000-7000-8000-000000000413'
const OTHER_MEDIA = '01930000-0000-7000-8000-000000000212'
const OTHER_TAG = '01930000-0000-7000-8000-000000000511'
const USER = '01930000-0000-7000-8000-000000000001'

const run = `t${process.pid}x${Date.now().toString(36)}`
const body = (text = 'Isi artikel uji.') => ({ version: 1, blocks: [{ type: 'paragraph', text }, { type: 'heading', level: 2, text: 'Bagian' }] })

/** EditorError dengan jenis tertentu (dan, bila diberi, field tertentu). */
async function rejects(promise: Promise<unknown>, kind: EditorError['kind'], field?: string) {
  const error = await promise.then(() => null, (e: unknown) => e)
  expect(error, 'seharusnya gagal').toBeInstanceOf(EditorError)
  const e = error as EditorError
  expect(e.kind).toBe(kind)
  if (field) expect(e.issues.map((i) => i.field)).toContain(field)
}

describe.skipIf(!process.env['DATABASE_URL'])('repository editor (database dev, role blog_app)', () => {
  const db = createDatabase({ connectionString: process.env['DATABASE_URL'] ?? '', max: 2, applicationName: 'vitest-editor' })
  const repos = createRepositories(db)
  const editor = repos.editor
  let SITE = ''
  let CAT_SUMATERA = ''
  let CAT_RESEP = ''
  let AUTHOR = ''
  let MEDIA = ''
  let TAG = ''

  beforeAll(async () => {
    const [site] = await db.insert(sites).values({ code: `uji-${run}`, name: `Site uji ${run}`, status: 'ARCHIVED' }).returning({ id: sites.id })
    if (!site) throw new Error('site uji gagal dibuat')
    SITE = site.id
    const [daerah] = await db.insert(categories).values({ siteId: SITE, name: 'Kuliner Daerah', slug: 'kuliner-daerah' }).returning({ id: categories.id })
    const cats = await db.insert(categories).values([
      { siteId: SITE, name: 'Sumatera', slug: 'sumatera', parentId: daerah?.id ?? null },
      { siteId: SITE, name: 'Resep', slug: 'resep' },
    ]).returning({ id: categories.id, slug: categories.slug })
    CAT_SUMATERA = cats.find((c) => c.slug === 'sumatera')?.id ?? ''
    CAT_RESEP = cats.find((c) => c.slug === 'resep')?.id ?? ''
    AUTHOR = (await db.insert(authors).values({ siteId: SITE, name: 'Redaksi Uji', slug: 'redaksi' }).returning({ id: authors.id }))[0]?.id ?? ''
    MEDIA = (await db.insert(media).values({ siteId: SITE, storageKey: `uji-${run}/foto.webp`, mimeType: 'image/webp', sizeBytes: 1000, width: 10, height: 10 }).returning({ id: media.id }))[0]?.id ?? ''
    TAG = (await db.insert(tags).values({ siteId: SITE, name: 'Pedas', slug: 'pedas' }).returning({ id: tags.id }))[0]?.id ?? ''
    await db.insert(menus).values({ siteId: SITE, location: 'footer', name: 'Menu bawah' })
  })

  afterAll(async () => {
    if (SITE) await db.delete(sites).where(eq(sites.id, SITE))
    await db.$client.end()
  })

  const article = (overrides: Record<string, unknown> = {}) => ({
    title: `Uji ${run}`,
    body: body(),
    categoryId: CAT_SUMATERA,
    authorId: AUTHOR,
    featuredMediaId: MEDIA,
    tagIds: [TAG],
    ...overrides,
  })

  describe('artikel', () => {
    it('buat draf: slug dari judul (unik per site), body_text, revisi 1, belum publik', async () => {
      const a = await editor.createArticle(SITE, article(), USER)
      const b = await editor.createArticle(SITE, article(), USER)
      expect(a.slug).toBe(`uji-${run}`)
      expect(b.slug).toBe(`uji-${run}-2`)
      expect(a).toMatchObject({ status: 'DRAFT', version: 1, publishedAt: null, publicPath: null, tagIds: [TAG] })
      const [row] = await db.select({ bodyText: articles.bodyText }).from(articles).where(eq(articles.id, a.id))
      expect(row?.bodyText).toBe('Isi artikel uji. Bagian')
      expect(await editor.listRevisions(SITE, a.id)).toMatchObject([{ revisionNo: 1, changeNote: 'Dibuat', createdBy: USER }])
      const list = await editor.listArticles(SITE, { q: run, status: 'DRAFT' })
      expect(list.items.map((i) => i.id)).toEqual(expect.arrayContaining([a.id, b.id]))
      expect(list.items[0]).toMatchObject({ category: { id: CAT_SUMATERA, name: 'Sumatera' }, author: { name: 'Redaksi Uji' } })
    })

    it('input tidak valid ditolak dengan field yang jelas', async () => {
      await rejects(editor.createArticle(SITE, article({ title: '' }), USER), 'invalid', 'title')
      await rejects(editor.createArticle(SITE, article({ body: { version: 1, blocks: [{ type: 'carousel' }] } }), USER), 'invalid', 'body.blocks.0.type')
      await rejects(editor.createArticle(SITE, article({ slug: 'Bukan Slug' }), USER), 'invalid', 'slug')
      await rejects(editor.createArticle(SITE, article({ seo: { robots: 'index' } }), USER), 'invalid', 'seo.robots')
      await rejects(editor.createArticle(SITE, article({ extra: 1 }), USER), 'invalid')
      // Slug dipakai artikel lain di site yang sama; slug sama di site lain boleh.
      await editor.createArticle(SITE, article({ slug: `dipakai-${run}` }), USER)
      await rejects(editor.createArticle(SITE, article({ slug: `dipakai-${run}` }), USER), 'invalid', 'slug')
      expect((await editor.createArticle(SITE, article({ slug: 'rendang-padang-empuk' }), USER)).slug).toBe('rendang-padang-empuk')
    })

    it('isolasi site: referensi dan artikel site lain tidak bisa dipakai atau disentuh', async () => {
      await rejects(editor.createArticle(SITE, article({ categoryId: OTHER_CATEGORY }), USER), 'invalid', 'categoryId')
      await rejects(editor.createArticle(SITE, article({ featuredMediaId: OTHER_MEDIA }), USER), 'invalid', 'featuredMediaId')
      await rejects(editor.createArticle(SITE, article({ tagIds: [OTHER_TAG] }), USER), 'invalid', 'tagIds')
      await rejects(editor.createArticle(SITE, article({ body: { version: 1, blocks: [{ type: 'image', mediaId: OTHER_MEDIA }] } }), USER), 'invalid', 'body')
      await rejects(editor.createArticle(SITE, article({ seo: { og_image_id: OTHER_MEDIA } }), USER), 'invalid', 'seo.og_image_id')

      const own = await editor.createArticle(SITE, article({ slug: `milik-uji-${run}` }), USER)
      await rejects(editor.getArticle(OTHER, own.id), 'not-found')
      await rejects(editor.updateArticle(OTHER, own.id, article({ categoryId: OTHER_CATEGORY }), 1, USER), 'not-found')
      await rejects(editor.archiveArticle(OTHER, own.id, 1, USER), 'not-found')
      expect((await editor.listArticles(OTHER, { q: run })).items).toEqual([])
      await rejects(editor.getArticle(SITE, 'bukan-uuid'), 'not-found')
    })

    it('ubah: versi naik + revisi baru; versi lama -> conflict', async () => {
      const a = await editor.createArticle(SITE, article({ slug: `versi-${run}` }), USER)
      const b = await editor.updateArticle(SITE, a.id, article({ slug: a.slug, title: 'Judul baru', tagIds: [] }), 1, USER, 'Ganti judul')
      expect(b).toMatchObject({ version: 2, title: 'Judul baru', tagIds: [] })
      await rejects(editor.updateArticle(SITE, a.id, article({ slug: a.slug }), 1, USER), 'conflict')
      expect((await editor.listRevisions(SITE, a.id)).map((r) => [r.revisionNo, r.changeNote])).toEqual([[2, 'Ganti judul'], [1, 'Dibuat']])
    })

    it('terbit, lalu slug berubah: redirect 301 dari URL lama, rantai diratakan, path yang terisi lagi dibebaskan', async () => {
      const s1 = `terbit-${run}`
      const s2 = `terbit-baru-${run}`
      const s3 = `terbit-final-${run}`
      const published = { status: 'PUBLISHED', publishedAt: '2026-01-05T03:00:00Z' }
      const a = await editor.createArticle(SITE, article({ slug: s1, ...published }), USER)
      expect(a.publicPath).toBe(`/sumatera/${s1}`)
      expect(await repos.content.getPublishedArticle(SITE, s1)).not.toBeNull()

      const b = await editor.updateArticle(SITE, a.id, article({ slug: s2, ...published }), 1, USER)
      expect(b.publicPath).toBe(`/sumatera/${s2}`)
      expect(await repos.content.findRedirect(SITE, `/sumatera/${s1}`)).toEqual({ toPath: `/sumatera/${s2}`, statusCode: 301 })

      // Kategori ikut berubah: URL berubah, rantai s1 -> s2 menjadi s1 -> s3.
      await editor.updateArticle(SITE, a.id, article({ slug: s3, categoryId: CAT_RESEP, ...published }), 2, USER)
      expect(await repos.content.findRedirect(SITE, `/sumatera/${s1}`)).toEqual({ toPath: `/resep/${s3}`, statusCode: 301 })
      expect(await repos.content.findRedirect(SITE, `/sumatera/${s2}`)).toEqual({ toPath: `/resep/${s3}`, statusCode: 301 })

      // Kembali ke URL pertama: redirect dari URL itu dihapus (kini berisi artikel lagi).
      await editor.updateArticle(SITE, a.id, article({ slug: s1, ...published }), 3, USER)
      expect(await repos.content.findRedirect(SITE, `/sumatera/${s1}`)).toBeNull()
      expect(await repos.content.findRedirect(SITE, `/resep/${s3}`)).toEqual({ toPath: `/sumatera/${s1}`, statusCode: 301 })
    })

    it('draf yang ganti slug tidak membuat redirect; terjadwal belum publik', async () => {
      const a = await editor.createArticle(SITE, article({ slug: `draf-${run}` }), USER)
      await editor.updateArticle(SITE, a.id, article({ slug: `draf-lain-${run}` }), 1, USER)
      expect(await repos.content.findRedirect(SITE, `/sumatera/draf-${run}`)).toBeNull()

      const future = await editor.createArticle(SITE, article({ slug: `jadwal-${run}`, status: 'PUBLISHED', publishedAt: '2099-01-01T00:00:00Z' }), USER)
      expect(future.publicPath).toBeNull()
      expect(await repos.content.getPublishedArticle(SITE, `jadwal-${run}`)).toBeNull()
    })

    it('PUBLISHED tanpa tanggal = sekarang; arsip menyembunyikan dan mencatat revisi', async () => {
      const a = await editor.createArticle(SITE, article({ slug: `arsip-${run}`, status: 'PUBLISHED' }), USER)
      expect(a.publishedAt).toBeInstanceOf(Date)
      expect(a.publicPath).toBe(`/sumatera/arsip-${run}`)
      const archived = await editor.archiveArticle(SITE, a.id, 1, USER)
      expect(archived).toMatchObject({ status: 'ARCHIVED', version: 2, publicPath: null })
      expect(await repos.content.getPublishedArticle(SITE, `arsip-${run}`)).toBeNull()
      expect((await editor.listRevisions(SITE, a.id))[0]).toMatchObject({ revisionNo: 2, changeNote: 'Diarsipkan' })
    })
  })

  describe('perbaikan code review 4.1', () => {
    it('tanggal terbit: tidak dikirim = dipertahankan, null = dikosongkan, PUBLISHED + null = sekarang', async () => {
      const a = await editor.createArticle(SITE, article({ slug: `tanggal-${run}`, status: 'PUBLISHED', publishedAt: '2099-01-01T00:00:00Z' }), USER)
      const kept = await editor.updateArticle(SITE, a.id, article({ slug: a.slug, status: 'DRAFT' }), 1, USER)
      expect(kept.publishedAt?.toISOString()).toBe('2099-01-01T00:00:00.000Z')
      const cleared = await editor.updateArticle(SITE, a.id, article({ slug: a.slug, status: 'DRAFT', publishedAt: null }), 2, USER)
      expect(cleared.publishedAt).toBeNull()
      const now = await editor.updateArticle(SITE, a.id, article({ slug: a.slug, status: 'PUBLISHED', publishedAt: null }), 3, USER)
      expect(now.publicPath).toBe(`/sumatera/tanggal-${run}`)
    })

    it('arsip tidak memvalidasi ulang isi lama (seo longgar tetap bisa diarsipkan)', async () => {
      const a = await editor.createArticle(SITE, article({ slug: `longgar-${run}`, status: 'PUBLISHED' }), USER)
      await db.update(articles).set({ seo: { title: 'Lama', keyLama: true } }).where(eq(articles.id, a.id))
      expect((await editor.archiveArticle(SITE, a.id, 1, USER)).status).toBe('ARCHIVED')
    })

    it('dua simpan bersamaan dengan slug sama: satu berhasil, yang lain galat field slug (bukan error database)', async () => {
      const results = await Promise.allSettled([0, 1, 2].map(() => editor.createArticle(SITE, article({ slug: `balapan-${run}` }), USER)))
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      for (const r of results.filter((x): x is PromiseRejectedResult => x.status === 'rejected')) {
        expect(r.reason).toBeInstanceOf(EditorError)
        expect((r.reason as EditorError).issues.map((i) => i.field)).toEqual(['slug'])
      }
    })

    it('media berdasarkan id: hanya milik site, id tidak valid diabaikan', async () => {
      expect((await editor.listMedia(SITE, { ids: [MEDIA] })).items.map((m) => m.id)).toEqual([MEDIA])
      expect((await editor.listMedia(SITE, { ids: [OTHER_MEDIA, 'bukan-uuid'] })).items).toEqual([])
      expect((await editor.listMedia(SITE, { ids: [] })).items).toEqual([])
    })

    it('gambar OG halaman dari site lain dilaporkan di seo.og_image_id', async () => {
      await rejects(editor.createPage(SITE, { title: 'x', body: body(), seo: { og_image_id: OTHER_MEDIA } }), 'invalid', 'seo.og_image_id')
    })
  })

  describe('tema', () => {
    const theme = (templateKey: string, primary = '#112233') => ({ templateKey, templateVersion: '1.1.0', tokens: { color: { primary } }, options: {}, layouts: { home: [] } })

    it('simpan + aktifkan; ganti template menonaktifkan yang lama; token kedaluwarsa = conflict', async () => {
      const a = await editor.saveTheme(SITE, theme('magazine'), null)
      expect(a).toMatchObject({ templateKey: 'magazine', templateVersion: '1.1.0', isActive: true, layouts: { home: [] } })
      await rejects(editor.saveTheme(SITE, theme('magazine'), null), 'conflict')

      const b = await editor.saveTheme(SITE, theme('news'), null)
      expect(b.isActive).toBe(true)
      const all = await editor.listThemes(SITE)
      expect(all.map((t) => [t.templateKey, t.isActive])).toEqual([['news', true], ['magazine', false]])

      // Kembali ke magazine dengan token yang benar: config lama dipertahankan, lalu diganti.
      const magazine = all.find((t) => t.templateKey === 'magazine')
      const c = await editor.saveTheme(SITE, theme('magazine', '#445566'), magazine?.updatedAt.toISOString() ?? null)
      expect(c).toMatchObject({ isActive: true, tokens: { color: { primary: '#445566' } } })
      await rejects(editor.saveTheme(SITE, theme('magazine'), magazine?.updatedAt.toISOString() ?? null), 'conflict')
      expect((await editor.listThemes(SITE)).filter((t) => t.isActive).map((t) => t.templateKey)).toEqual(['magazine'])
      expect(await editor.listThemes(OTHER)).not.toEqual([])
      expect((await editor.listThemes(OTHER)).some((t) => t.tokens['color'] && (t.tokens['color'] as Record<string, unknown>)['primary'] === '#445566')).toBe(false)
    })
  })

  describe('media', () => {
    const file = (name: string) => ({ storageKey: `uji-${run}/2026/11/${name}.png`, mimeType: 'image/png', sizeBytes: 1234, width: 800, height: 600 })

    it('catat, ubah keterangan, pemakaian menghalangi hapus, lalu hapus', async () => {
      const m = await editor.createMedia(SITE, file('a'), { altText: ' Rendang di piring ', caption: '' }, USER)
      expect(m).toMatchObject({ altText: 'Rendang di piring', caption: null, focalX: 0.5, width: 800 })
      await rejects(editor.createMedia(SITE, file('b'), { altText: '' }, USER), 'invalid', 'altText')
      await expect(editor.createMedia(SITE, { ...file('c'), storageKey: 'dapur-nusantara/2026/11/c.png' }, { altText: 'x' }, USER)).rejects.toThrow(/bukan milik site/)

      const u = await editor.updateMedia(SITE, m.id, { altText: 'Rendang', credit: 'Foto: Uji', focalX: 0.3, focalY: 0.7 }, m.updatedAt.toISOString())
      expect(u).toMatchObject({ credit: 'Foto: Uji', focalX: 0.3, focalY: 0.7 })
      await rejects(editor.updateMedia(SITE, m.id, { altText: 'x' }, m.updatedAt.toISOString()), 'conflict')
      await rejects(editor.updateMedia(OTHER, m.id, { altText: 'x' }, u.updatedAt.toISOString()), 'not-found')

      // Dipakai sebagai gambar utama, di block gambar, dan sebagai gambar OG.
      const a = await editor.createArticle(SITE, article({ slug: `pakai-media-${run}`, featuredMediaId: null, body: { version: 1, blocks: [{ type: 'image', mediaId: m.id }] }, seo: { og_image_id: m.id } }), USER)
      expect(await editor.mediaUsage(SITE, m.id)).toEqual([`artikel "${a.title}"`])
      await rejects(editor.deleteMedia(SITE, m.id, u.updatedAt.toISOString()), 'invalid')

      await editor.archiveArticle(SITE, a.id, 1, USER) // arsip tetap memakai media
      await db.delete(articles).where(eq(articles.id, a.id))
      expect(await editor.mediaUsage(SITE, m.id)).toEqual([])
      expect(await editor.deleteMedia(SITE, m.id, u.updatedAt.toISOString())).toEqual({ storageKey: file('a').storageKey })
      expect((await editor.listMedia(SITE, { ids: [m.id] })).items).toEqual([])
    })
  })

  describe('halaman', () => {
    it('buat, ubah slug halaman terbit -> redirect; updatedAt lama -> conflict', async () => {
      const p = await editor.createPage(SITE, { title: `Halaman ${run}`, slug: `hal-${run}`, body: body(), status: 'PUBLISHED' })
      const q = await editor.updatePage(SITE, p.id, { title: p.title, slug: `hal-baru-${run}`, body: body('Ubah'), status: 'PUBLISHED' }, p.updatedAt.toISOString())
      expect(q.slug).toBe(`hal-baru-${run}`)
      expect(await repos.content.findRedirect(SITE, `/p/hal-${run}`)).toEqual({ toPath: `/p/hal-baru-${run}`, statusCode: 301 })
      await rejects(editor.updatePage(SITE, p.id, { title: 'x', body: body(), status: 'DRAFT' }, p.updatedAt.toISOString()), 'conflict')
      await rejects(editor.updatePage(OTHER, p.id, { title: 'x', body: body() }, q.updatedAt.toISOString()), 'not-found')
    })
  })

  describe('kategori', () => {
    it('induk bertingkat, siklus ditolak, slug cadangan ditolak, ganti slug -> redirect', async () => {
      const parent = await editor.createCategory(SITE, { name: `Induk ${run}` })
      const child = await editor.createCategory(SITE, { name: 'Anak', slug: `anak-${run}`, parentId: parent.id })
      expect(child.parentId).toBe(parent.id)
      await rejects(editor.updateCategory(SITE, parent.id, { name: parent.name, parentId: child.id }, parent.updatedAt.toISOString()), 'invalid', 'parentId')
      await rejects(editor.createCategory(SITE, { name: 'Admin', slug: 'admin' }), 'invalid', 'slug')
      await rejects(editor.createCategory(SITE, { name: 'X', parentId: OTHER_CATEGORY }), 'invalid', 'parentId')
      // Nama "Admin" tanpa slug: slug cadangan dilewati, jadi admin-2.
      expect((await editor.createCategory(SITE, { name: 'Admin' })).slug).toBe('admin-2')

      const renamed = await editor.updateCategory(SITE, parent.id, { name: parent.name, slug: `induk-baru-${run}` }, parent.updatedAt.toISOString())
      expect(await repos.content.findRedirect(SITE, `/category/${parent.slug}`)).toEqual({ toPath: `/category/induk-baru-${run}`, statusCode: 301 })
      const hidden = await editor.updateCategory(SITE, parent.id, { name: parent.name, slug: renamed.slug }, renamed.updatedAt.toISOString(), 'HIDDEN')
      expect(hidden.status).toBe('HIDDEN')
    })
  })

  describe('tag', () => {
    it('buat, ubah, hapus dengan token updatedAt', async () => {
      const t = await editor.createTag(SITE, { name: `Tag ${run}` })
      const u = await editor.updateTag(SITE, t.id, { name: 'Tag ganti', slug: `tag-ganti-${run}` }, t.updatedAt.toISOString())
      await rejects(editor.deleteTag(SITE, t.id, t.updatedAt.toISOString()), 'conflict')
      await rejects(editor.deleteTag(OTHER, t.id, u.updatedAt.toISOString()), 'not-found')
      await editor.deleteTag(SITE, t.id, u.updatedAt.toISOString())
      expect((await editor.listTags(SITE)).some((x) => x.id === t.id)).toBe(false)
    })
  })

  describe('menu', () => {
    it('item menu: target milik site, induk di menu yang sama, tanpa siklus', async () => {
      const a = await editor.createArticle(SITE, article({ slug: `menu-${run}` }), USER)
      const item = await editor.createMenuItem(SITE, 'footer', { label: `${run} artikel`, type: 'ARTICLE', targetId: a.id })
      const sub = await editor.createMenuItem(SITE, 'footer', { label: `${run} sub`, type: 'URL', url: 'https://contoh.id', parentId: item.id })
      expect((await editor.getMenu(SITE, 'footer')).items.map((i) => i.id)).toEqual(expect.arrayContaining([item.id, sub.id]))

      await rejects(editor.createMenuItem(SITE, 'footer', { label: `${run} x`, type: 'CATEGORY', targetId: OTHER_CATEGORY }), 'invalid', 'targetId')
      await rejects(editor.createMenuItem(SITE, 'footer', { label: `${run} x`, type: 'URL', url: 'javascript:alert(1)' }), 'invalid', 'url')
      await rejects(editor.createMenuItem(SITE, 'footer', { label: `${run} x`, type: 'ROUTE', url: '//evil.test' }), 'invalid', 'url')
      await rejects(editor.updateMenuItem(SITE, 'footer', item.id, { label: item.label, type: 'ARTICLE', targetId: a.id, parentId: sub.id }, item.updatedAt.toISOString()), 'invalid', 'parentId')
      await rejects(editor.createMenuItem(SITE, 'tidak-ada', { label: 'x', type: 'ROUTE', url: '/' }), 'not-found')
      await rejects(editor.deleteMenuItem(OTHER, 'footer', item.id, item.updatedAt.toISOString()), 'not-found')

      const renamed = await editor.updateMenuItem(SITE, 'footer', item.id, { label: `${run} ganti`, type: 'ARTICLE', targetId: a.id }, item.updatedAt.toISOString())
      expect(renamed.label).toBe(`${run} ganti`)
      await editor.deleteMenuItem(SITE, 'footer', item.id, renamed.updatedAt.toISOString())
      // Sub-item ikut terhapus (CASCADE).
      expect((await editor.getMenu(SITE, 'footer')).items.some((i) => i.id === sub.id)).toBe(false)
    })
  })
})
