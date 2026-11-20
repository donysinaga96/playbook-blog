// Smoke test koneksi sebagai role aplikasi (blog_app) ke database dev yang
// sudah di-seed (pnpm db:up). Dilewati bila DATABASE_URL tidak ada.
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { createDatabase, databaseUrlFromEnv } from './client'
import { siteDomains, sites } from './schema/schema'

const url = process.env['DATABASE_URL']

describe('databaseUrlFromEnv', () => {
  it('gagal dengan pesan jelas bila DATABASE_URL kosong', () => {
    expect(() => databaseUrlFromEnv({})).toThrow(/DATABASE_URL/)
  })
})

describe.skipIf(!url)('koneksi ke database dev (blog_app)', () => {
  const db = createDatabase({ connectionString: url ?? '', max: 2, applicationName: 'vitest' })
  afterAll(() => db.$client.end())

  it('terhubung sebagai role aplikasi, bukan pemilik schema', async () => {
    const { rows } = await db.$client.query<{ current_user: string }>('SELECT current_user')
    expect(rows[0]?.current_user).toBe('blog_app')
  })

  it('query builder: domain tekno.localhost milik site kabar-tekno', async () => {
    const rows = await db
      .select({ code: sites.code })
      .from(siteDomains)
      .innerJoin(sites, eq(sites.id, siteDomains.siteId))
      .where(eq(siteDomains.domain, 'tekno.localhost'))
    expect(rows).toEqual([{ code: 'kabar-tekno' }])
  })

  it('relational query: artikel memuat kategori lewat relasi composite', async () => {
    const article = await db.query.articles.findFirst({
      where: { slug: 'rendang-padang-empuk' },
      with: { category: true },
    })
    expect(article?.category?.slug).toBe('sumatera')
    expect(article?.category?.siteId).toBe(article?.siteId)
  })
})
