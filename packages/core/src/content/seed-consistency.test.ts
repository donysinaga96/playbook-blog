// Memastikan skema Zod dan extractBodyText() cocok dengan data nyata di
// database dev yang di-seed (pnpm db:up): setiap body valid, setiap body_text
// sama dengan hasil ekstraksi, dan settings kedua site terbaca.
// Dilewati bila DATABASE_URL tidak ada (mis. di CI).
//
// Hanya data dua site seed yang diperiksa: file test lain membuat site dan
// konten sementara (mis. body rusak yang disengaja) secara paralel.
import { articles, createDatabase, databaseUrlFromEnv, inArray, pages, sites } from '@framework/db'
import { afterAll, describe, expect, it } from 'vitest'
import { parseSiteSettings } from '../site/settings'
import { parseBody } from './blocks'
import { extractBodyText } from './extract-body-text'

const hasDb = Boolean(process.env['DATABASE_URL'])

describe.skipIf(!hasDb)('data seed di database dev', () => {
  const db = createDatabase({ connectionString: hasDb ? databaseUrlFromEnv() : '', max: 2, applicationName: 'vitest-core' })
  afterAll(() => db.$client.end())

  const SEED_SITES = ['dapur-nusantara', 'kabar-tekno']
  const seedSiteIds = async () =>
    (await db.select({ id: sites.id }).from(sites).where(inArray(sites.code, SEED_SITES))).map((s) => s.id)

  it('semua body artikel dan halaman lolos skema block v1', async () => {
    const ids = await seedSiteIds()
    const articleRows = await db.select({ slug: articles.slug, body: articles.body }).from(articles).where(inArray(articles.siteId, ids))
    const pageRows = await db.select({ slug: pages.slug, body: pages.body }).from(pages).where(inArray(pages.siteId, ids))
    expect(articleRows.length).toBeGreaterThanOrEqual(7)
    for (const row of [...articleRows, ...pageRows]) {
      expect(() => parseBody(row.body), row.slug).not.toThrow()
    }
  })

  it('body_text di database sama dengan extractBodyText(body)', async () => {
    const rows = await db
      .select({ slug: articles.slug, body: articles.body, bodyText: articles.bodyText })
      .from(articles)
      .where(inArray(articles.siteId, await seedSiteIds()))
    for (const a of rows) {
      expect(extractBodyText(parseBody(a.body)), a.slug).toBe(a.bodyText)
    }
  })

  it('sites.settings kedua site lolos skema', async () => {
    const rows = await db.select({ code: sites.code, settings: sites.settings }).from(sites).where(inArray(sites.code, SEED_SITES))
    expect(rows.map((r) => r.code).sort()).toEqual(SEED_SITES)
    for (const r of rows) {
      expect(() => parseSiteSettings(r.settings), r.code).not.toThrow()
    }
  })
})
