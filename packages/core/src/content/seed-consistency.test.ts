// Memastikan skema Zod dan extractBodyText() cocok dengan data nyata di
// database dev yang di-seed (pnpm db:up): setiap body valid, setiap body_text
// sama dengan hasil ekstraksi, dan settings kedua site terbaca.
// Dilewati bila DATABASE_URL tidak ada (mis. di CI).
import { createDatabase, databaseUrlFromEnv } from '@framework/db'
import { afterAll, describe, expect, it } from 'vitest'
import { parseSiteSettings } from '../site/settings'
import { parseBody } from './blocks'
import { extractBodyText } from './extract-body-text'

const hasDb = Boolean(process.env['DATABASE_URL'])

describe.skipIf(!hasDb)('data seed di database dev', () => {
  const db = createDatabase({ connectionString: hasDb ? databaseUrlFromEnv() : '', max: 2, applicationName: 'vitest-core' })
  afterAll(() => db.$client.end())

  it('semua body artikel dan halaman lolos skema block v1', async () => {
    const articles = await db.query.articles.findMany({ columns: { slug: true, body: true } })
    const pages = await db.query.pages.findMany({ columns: { slug: true, body: true } })
    expect(articles.length).toBeGreaterThanOrEqual(7)
    for (const row of [...articles, ...pages]) {
      expect(() => parseBody(row.body), row.slug).not.toThrow()
    }
  })

  it('body_text di database sama dengan extractBodyText(body)', async () => {
    const articles = await db.query.articles.findMany({ columns: { slug: true, body: true, bodyText: true } })
    for (const a of articles) {
      expect(extractBodyText(parseBody(a.body)), a.slug).toBe(a.bodyText)
    }
  })

  it('sites.settings kedua site lolos skema', async () => {
    const rows = await db.query.sites.findMany({ columns: { code: true, settings: true } })
    expect(rows.map((r) => r.code).sort()).toEqual(['dapur-nusantara', 'kabar-tekno'])
    for (const r of rows) {
      expect(() => parseSiteSettings(r.settings), r.code).not.toThrow()
    }
  })
})
