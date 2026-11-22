// Repository hasil AI terhadap database dev (dilewati tanpa DATABASE_URL).
// Pola sama dengan test editor: semua tulisan di site uji sendiri (ARCHIVED)
// yang dihapus di afterAll beserta isinya (CASCADE). Hasil AI ditulis lewat
// role aplikasi di sini; hak role agent diuji di packages/db/run_all.sh.
import { articleReferences, articles, categories, authors, createDatabase, eq, generatedArticles, media, sites, tags } from '@framework/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { EditorError } from '../editor/errors'
import { createRepositories } from '../repositories'
import type { ImageReader } from './generated-repository'
import { withPreviewArticle } from './preview-content'

const OTHER = '01930000-0000-7000-8000-000000000102' // dapur-nusantara (seed, hanya dibaca)
const OTHER_MEDIA_KEY = 'dapur-nusantara/2026/11/rendang.webp'
const USER = '01930000-0000-7000-8000-000000000001'
const run = `g${process.pid}x${Date.now().toString(36)}`
const code = `uji-${run}`

/** PNG minimal yang lolos sniffImage: signature + header IHDR. */
function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  new DataView(b.buffer).setUint32(16, width)
  new DataView(b.buffer).setUint32(20, height)
  return b
}

const files = new Map<string, Uint8Array>()
const storage: ImageReader = { read: async (key) => files.get(key) ?? null }

async function rejects(promise: Promise<unknown>, kind: EditorError['kind'], field?: string) {
  const error = await promise.then(() => null, (e: unknown) => e)
  expect(error, 'seharusnya gagal').toBeInstanceOf(EditorError)
  const e = error as EditorError
  expect(e.kind).toBe(kind)
  if (field !== undefined) expect(e.issues.map((i) => i.field)).toContain(field)
}

describe.skipIf(!process.env['DATABASE_URL'])('repository hasil AI (database dev, role blog_app)', () => {
  const db = createDatabase({ connectionString: process.env['DATABASE_URL'] ?? '', max: 4, applicationName: 'vitest-generated' })
  const repos = createRepositories(db)
  const generated = repos.generated
  let SITE = ''
  let HIDDEN_CAT = ''
  let seq = 0

  beforeAll(async () => {
    const [site] = await db.insert(sites).values({ code, name: `Site uji ${run}`, status: 'ARCHIVED' }).returning({ id: sites.id })
    if (!site) throw new Error('site uji gagal dibuat')
    SITE = site.id
    await db.insert(categories).values({ siteId: SITE, name: 'Resep', slug: 'resep' })
    HIDDEN_CAT = (await db.insert(categories).values({ siteId: SITE, name: 'Lama', slug: 'lama', status: 'HIDDEN' }).returning({ id: categories.id }))[0]?.id ?? ''
    await db.insert(authors).values({ siteId: SITE, name: 'Redaksi', slug: 'redaksi' })
    await db.insert(tags).values({ siteId: SITE, name: 'Pedas', slug: 'pedas' })
  })

  afterAll(async () => {
    if (SITE) await db.delete(sites).where(eq(sites.id, SITE))
    await db.$client.end()
  })

  const payload = (overrides: Record<string, unknown> = {}) => ({
    version: 1,
    title: `Sambal uji ${run}`,
    category: 'resep',
    author: 'redaksi',
    tags: ['Pedas', `Baru ${run}`],
    body: { version: 1, blocks: [{ type: 'paragraph', text: 'Isi sambal uji.' }] },
    references: [{ title: 'Sumber', url: 'https://contoh.test/sambal' }],
    ...overrides,
  })

  /** Tulis hasil AI seperti agent; mengembalikan id. */
  async function ingest(p: unknown = payload(), siteId = SITE): Promise<string> {
    const [row] = await db.insert(generatedArticles)
      .values({ siteId, externalId: `${run}/${++seq}`, payload: p, agentNote: 'catatan agent' })
      .returning({ id: generatedArticles.id })
    if (!row) throw new Error('insert hasil AI gagal')
    return row.id
  }

  /** Token versi yang dilihat admin. */
  const token = async (id: string, siteId = SITE) => (await generated.get(siteId, id)).updatedAt.toISOString()
  const approve = async (id: string, input: Record<string, unknown>, siteId = SITE) =>
    generated.approve(siteId, id, { expectedUpdatedAt: await token(id).catch(() => new Date().toISOString()), ...input } as never, USER, storage)
  const reject = async (id: string, note: string, siteId = SITE) =>
    generated.reject(siteId, id, note, await token(id).catch(() => new Date().toISOString()), USER)

  const errors = (issues: { level: string; field: string }[]) => issues.filter((i) => i.level === 'error').map((i) => i.field)
  const warnings = (issues: { level: string; field: string }[]) => issues.filter((i) => i.level === 'warning').map((i) => i.field)

  describe('antrian', () => {
    it('daftar per site milik user, hanya READY_TO_PUBLISH, judul dari payload', async () => {
      const id = await ingest()
      const list = await generated.list([SITE])
      expect(list.items.map((i) => i.id)).toContain(id)
      expect(list.items.find((i) => i.id === id)).toMatchObject({ status: 'READY_TO_PUBLISH', title: `Sambal uji ${run}`, agentNote: 'catatan agent' })
      expect((await generated.list([])).items).toEqual([])
      expect((await generated.countReady([SITE]))[SITE]).toBeGreaterThanOrEqual(1)
    })

    it('site lain: tidak ditemukan (keberadaan tidak dibocorkan)', async () => {
      const id = await ingest()
      await rejects(generated.get(OTHER, id), 'not-found')
      await rejects(generated.review(OTHER, id, storage), 'not-found')
      await rejects(approve(id, { mode: 'publish' }, OTHER), 'not-found')
      await rejects(reject(id, 'x', OTHER), 'not-found')
      await rejects(generated.get(SITE, 'bukan-uuid'), 'not-found')
    })
  })

  describe('pemeriksaan', () => {
    it('payload valid: tanpa galat; tag baru = peringatan', async () => {
      const review = await generated.review(SITE, await ingest(), storage)
      expect(errors(review.issues)).toEqual([])
      expect(warnings(review.issues)).toEqual(['tags'])
      expect(review.canApprove).toBe(true)
      expect(review.plan?.tags.map((t) => [t.slug, Boolean(t.id)])).toEqual([['pedas', true], [`baru-${run}`, false]])
    })

    it('payload tidak lolos skema: semua masalah skema, tanpa pemeriksaan database', async () => {
      const review = await generated.review(SITE, await ingest(payload({ version: 9, status: 'PUBLISHED' })), storage)
      expect(review.canApprove).toBe(false)
      expect(errors(review.issues)).toEqual(expect.arrayContaining(['version', '']))
    })

    it.each([
      ['kategori tidak ada', { category: 'minuman' }, 'category'],
      ['kategori tidak aktif', { category: 'lama' }, 'category'],
      ['penulis tidak ada', { author: 'tamu' }, 'author'],
      ['embed URL tidak dikenali provider', { body: { version: 1, blocks: [{ type: 'embed', provider: 'youtube', url: 'https://www.youtube.com/channel/x' }] } }, 'body.blocks.0.url'],
    ])('galat: %s', async (_name, overrides, field) => {
      const review = await generated.review(SITE, await ingest(payload(overrides)), storage)
      expect(errors(review.issues)).toContain(field)
      expect(review.canApprove).toBe(false)
      expect(review.plan).toBeNull()
    })

    it('slug yang sudah dipakai artikel site ini = galat; slug yang sama di site lain tidak masalah', async () => {
      await repos.editor.createArticle(SITE, { title: 'Ada', slug: `dipakai-${run}`, body: payload().body, categoryId: HIDDEN_CAT }, USER)
      const taken = await generated.review(SITE, await ingest(payload({ slug: `dipakai-${run}` })), storage)
      expect(errors(taken.issues)).toContain('slug')
      const seedSlug = await generated.review(SITE, await ingest(payload({ slug: 'rendang-padang-empuk' })), storage)
      expect(errors(seedSlug.issues)).toEqual([])
    })

    it('gambar: prefix site, file ada, isi gambar sah, ekstensi cocok, milik site lain; tanpa kredit = peringatan', async () => {
      files.set(`${code}/ok.png`, png(800, 600))
      files.set(`${code}/bukan.png`, new TextEncoder().encode('<svg/>'))
      files.set(`${code}/salah.webp`, png(10, 10))
      const images = [
        { key: 'a', storageKey: `${code}/ok.png`, altText: 'ok' },
        { key: 'b', storageKey: `${code}/tidak-ada.png`, altText: 'x', credit: 'Foto' },
        { key: 'c', storageKey: `${code}/bukan.png`, altText: 'x', credit: 'Foto' },
        { key: 'd', storageKey: `${code}/salah.webp`, altText: 'x', credit: 'Foto' },
        { key: 'e', storageKey: `site-lain/x.png`, altText: 'x', credit: 'Foto' },
        { key: 'f', storageKey: OTHER_MEDIA_KEY.replace('dapur-nusantara', code), altText: 'x', credit: 'Foto' },
      ]
      const review = await generated.review(SITE, await ingest(payload({ images })), storage)
      expect(errors(review.issues)).toEqual(['images.1.storageKey', 'images.2.storageKey', 'images.3.storageKey', 'images.4.storageKey', 'images.5.storageKey'])
      expect(warnings(review.issues)).toContain('images.0')
      const noStorage = await generated.review(SITE, await ingest(payload({ images: images.slice(0, 1) })), null)
      expect(errors(noStorage.issues)).toEqual(['images.0.storageKey'])
    })

    it('media yang sudah tercatat: site sendiri dipakai ulang, site lain = galat', async () => {
      const [own] = await db.insert(media).values({ siteId: SITE, storageKey: `${code}/lama.webp`, mimeType: 'image/webp', sizeBytes: 10, width: 1, height: 1 }).returning({ id: media.id })
      const [seedMedia] = await db.select({ storageKey: media.storageKey }).from(media).where(eq(media.siteId, OTHER)).limit(1)
      const review = await generated.review(SITE, await ingest(payload({
        images: [{ key: 'a', storageKey: `${code}/lama.webp`, altText: 'x', credit: 'F' }],
        cover: 'a',
      })), storage)
      expect(errors(review.issues)).toEqual([])
      expect(review.plan?.images.get('a')).toMatchObject({ kind: 'existing', mediaId: own?.id })
      // storage_key seed site lain tidak diawali kode site uji: galat prefix sudah cukup
      // membuktikan file site lain tidak bisa dipakai.
      const foreign = await generated.review(SITE, await ingest(payload({ images: [{ key: 'a', storageKey: seedMedia?.storageKey ?? '', altText: 'x' }] })), storage)
      expect(errors(foreign.issues)).toEqual(['images.0.storageKey'])
    })

    it('tanpa referensi dan video yang tidak tercantum di referensi = peringatan', async () => {
      const review = await generated.review(SITE, await ingest(payload({
        tags: [],
        references: [],
        body: { version: 1, blocks: [{ type: 'embed', provider: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }] },
      })), storage)
      expect(errors(review.issues)).toEqual([])
      expect(warnings(review.issues).sort()).toEqual(['body.blocks.0.url', 'references'])
    })
  })

  describe('approve', () => {
    it('terbit sekarang: media, tag baru, artikel, referensi, revisi; hasil AI APPROVED', async () => {
      files.set(`${code}/sampul.png`, png(1200, 630))
      const id = await ingest(payload({
        slug: `sambal-${run}`,
        cover: 'sampul',
        images: [{ key: 'sampul', storageKey: `${code}/sampul.png`, altText: 'Sambal', credit: 'Foto: Uji', sourceUrl: 'https://contoh.test/foto' }],
        body: { version: 1, blocks: [{ type: 'paragraph', text: 'Ulek kasar.' }, { type: 'image', image: 'sampul', caption: 'Sambal' }] },
        references: [{ title: 'Sumber', url: 'https://contoh.test/sambal', publisher: 'Contoh' }, { title: 'Video', url: 'https://youtu.be/abc', kind: 'VIDEO' }],
      }))
      const { article, generated: after } = await approve(id, { mode: 'publish', note: 'oke' })

      expect(after).toMatchObject({ status: 'APPROVED', articleId: article.id, reviewNote: 'oke', reviewedBy: USER })
      expect(article).toMatchObject({ status: 'PUBLISHED', slug: `sambal-${run}`, excerpt: null })
      expect(article.publishedAt).not.toBeNull()
      const [cover] = await db.select().from(media).where(eq(media.id, article.featuredMediaId ?? ''))
      expect(cover).toMatchObject({ siteId: SITE, storageKey: `${code}/sampul.png`, mimeType: 'image/png', sizeBytes: 33, width: 1200, height: 630, credit: 'Foto: Uji', sourceUrl: 'https://contoh.test/foto', createdBy: USER })
      expect(article.body.blocks[1]).toEqual({ type: 'image', mediaId: cover?.id, caption: 'Sambal' })
      const tagRows = await db.select({ slug: tags.slug }).from(tags).where(eq(tags.siteId, SITE))
      expect(tagRows.map((t) => t.slug)).toEqual(expect.arrayContaining(['pedas', `baru-${run}`]))
      expect(article.tagIds).toHaveLength(2)
      const refs = await db.select().from(articleReferences).where(eq(articleReferences.articleId, article.id)).orderBy(articleReferences.position)
      expect(refs.map((r) => [r.position, r.url, r.kind, r.publisher])).toEqual([[1, 'https://contoh.test/sambal', 'ARTICLE', 'Contoh'], [2, 'https://youtu.be/abc', 'VIDEO', null]])
      expect(article.references).toHaveLength(2)
      const [row] = await db.select({ bodyText: articles.bodyText }).from(articles).where(eq(articles.id, article.id))
      expect(row?.bodyText).toBe('Ulek kasar.')
      expect(await repos.editor.listRevisions(SITE, article.id)).toMatchObject([{ revisionNo: 1, changeNote: expect.stringContaining('Dari hasil AI') }])
      // Sudah diputuskan: tidak bisa di-approve atau ditolak lagi.
      await rejects(approve(id, { mode: 'publish' }), 'conflict')
      await rejects(reject(id, 'telat'), 'conflict')
      const review = await generated.review(SITE, id, storage)
      expect(review.canApprove).toBe(false)
    })

    it('jadwalkan: tanggal wajib, di masa depan, dengan zona waktu', async () => {
      const id = await ingest()
      await rejects(approve(id, { mode: 'schedule' }), 'invalid', 'publishAt')
      await rejects(approve(id, { mode: 'schedule', publishAt: '2020-01-01T00:00:00Z' }), 'invalid', 'publishAt')
      await rejects(approve(id, { mode: 'schedule', publishAt: '2099-01-01T08:00:00' }), 'invalid', 'publishAt')
      const { article } = await approve(id, { mode: 'schedule', publishAt: '2099-01-01T08:00:00+07:00' })
      expect(article).toMatchObject({ status: 'PUBLISHED', publicPath: null })
      expect(article.publishedAt?.toISOString()).toBe('2099-01-01T01:00:00.000Z')
    })

    it('pindahkan sebagai draft: artikel DRAFT tanpa tanggal', async () => {
      const { article } = await approve(await ingest(), { mode: 'draft' })
      expect(article).toMatchObject({ status: 'DRAFT', publishedAt: null })
    })

    it('ada galat: ditolak dengan daftar galat, tidak ada yang ditulis', async () => {
      const id = await ingest(payload({ category: 'minuman', tags: [`Tidak dibuat ${run}`] }))
      await rejects(approve(id, { mode: 'publish' }), 'invalid', 'category')
      expect((await generated.get(SITE, id)).status).toBe('READY_TO_PUBLISH')
      const leaked = await db.select({ id: tags.id }).from(tags).where(eq(tags.slug, `tidak-dibuat-${run}`))
      expect(leaked).toEqual([])
    })

    it('mode tidak dikenal ditolak', async () => {
      await rejects(approve(await ingest(), { mode: 'langsung' as never }), 'invalid', 'mode')
    })

    it('dua approve bersamaan: satu artikel, yang lain conflict', async () => {
      const id = await ingest(payload({ slug: `balapan-${run}` }))
      const results = await Promise.allSettled([
        approve(id, { mode: 'publish' }),
        approve(id, { mode: 'publish' }),
      ])
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      const failed = results.find((r) => r.status === 'rejected')
      expect((failed as PromiseRejectedResult).reason).toBeInstanceOf(EditorError)
      expect(((failed as PromiseRejectedResult).reason as EditorError).kind).toBe('conflict')
      const created = await db.select({ id: articles.id }).from(articles).where(eq(articles.slug, `balapan-${run}`))
      expect(created).toHaveLength(1)
    })
  })

  describe('pratinjau', () => {
    it('artikel sintetis dari payload; media baru id sementara; konten lain tidak terpengaruh', async () => {
      files.set(`${code}/pratinjau.png`, png(640, 480))
      const id = await ingest(payload({
        slug: `pratinjau-${run}`,
        cover: 'c',
        images: [{ key: 'c', storageKey: `${code}/pratinjau.png`, altText: 'Sampul', credit: 'F' }],
        body: { version: 1, blocks: [{ type: 'image', image: 'c' }] },
      }))
      const { review, preview } = await generated.preview(SITE, id, storage)
      expect(review.canApprove).toBe(true)
      expect(preview?.article).toMatchObject({ slug: `pratinjau-${run}`, category: { slug: 'resep' }, author: { slug: 'redaksi' } })
      expect(preview?.article.tags.map((t) => t.slug)).toEqual(['pedas', `baru-${run}`])
      const mediaId = preview?.article.featuredMedia?.id ?? ''
      expect(preview?.article.body.blocks).toEqual([{ type: 'image', mediaId }])

      const content = withPreviewArticle(repos.content, SITE, preview!)
      expect(await content.getPublishedArticle(SITE, `pratinjau-${run}`)).toBe(preview!.article)
      expect(await content.getPublishedArticle(OTHER, `pratinjau-${run}`)).toBeNull()
      expect((await content.getMediaByIds(SITE, [mediaId])).map((m) => m.storageKey)).toEqual([`${code}/pratinjau.png`])
      // Tidak ada yang ditulis ke database.
      expect(await db.select({ id: media.id }).from(media).where(eq(media.storageKey, `${code}/pratinjau.png`))).toEqual([])
    })

    it('masih ada galat: tanpa pratinjau', async () => {
      const { preview } = await generated.preview(SITE, await ingest(payload({ category: 'minuman' })), storage)
      expect(preview).toBeNull()
    })
  })

  describe('versi yang dilihat admin', () => {
    it('agent memperbarui hasil setelah admin membukanya: approve dan tolak = conflict', async () => {
      const id = await ingest()
      const seen = await token(id)
      await new Promise((r) => setTimeout(r, 5))
      await db.update(generatedArticles).set({ payload: payload({ title: `Versi baru ${run}` }) }).where(eq(generatedArticles.id, id))
      await rejects(generated.approve(SITE, id, { mode: 'publish', expectedUpdatedAt: seen }, USER, storage), 'conflict')
      await rejects(generated.reject(SITE, id, 'x', seen, USER), 'conflict')
      await rejects(generated.approve(SITE, id, { mode: 'publish', expectedUpdatedAt: 'kemarin' }, USER, storage), 'invalid', 'expectedUpdatedAt')
      const { article } = await approve(id, { mode: 'draft' })
      expect(article.title).toBe(`Versi baru ${run}`)
    })
  })

  describe('tolak', () => {
    it('alasan wajib; ARCHIVED dengan alasan; tidak membuat artikel', async () => {
      const id = await ingest()
      await rejects(reject(id, '   '), 'invalid', 'note')
      await rejects(reject(id, 'x'.repeat(1_001)), 'invalid', 'note')
      const rejected = await reject(id, '  Fakta tidak cocok dengan sumber.  ')
      expect(rejected).toMatchObject({ status: 'ARCHIVED', reviewNote: 'Fakta tidak cocok dengan sumber.', reviewedBy: USER, articleId: null })
      expect(rejected.reviewedAt).not.toBeNull()
      expect((await generated.list([SITE], { status: 'ARCHIVED' })).items.map((i) => i.id)).toContain(id)
      expect((await generated.list([SITE])).items.map((i) => i.id)).not.toContain(id)
    })
  })
})
