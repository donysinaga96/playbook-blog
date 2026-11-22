// Snapshot view model per jenis halaman (gate M2): view model adalah kontrak
// publik template (ADR-005), jadi perubahannya harus terlihat di review,
// bukan terjadi diam-diam. Bila snapshot berubah dengan sengaja:
//   pnpm vitest run packages/core/src/views -u
// lalu periksa diff file .snap sebelum commit.
//
// Berjalan terhadap database dev yang di-seed (dilewati tanpa DATABASE_URL;
// di CI DATABASE_URL wajib ada). Jam dipatok. Kolom updated_at seed berisi
// waktu saat seed dijalankan, jadi diganti penanda tetap sebelum dibandingkan.
import { createDatabase } from '@framework/db'
import { afterAll, describe, expect, it } from 'vitest'
import { createMediaUrlResolver } from '../media/storage'
import { createRepositories, type SiteInfo } from '../repositories'
import type { ResolvedSection } from '@framework/template-kit'
import { createPageBuilder, type PageResult } from './build-page'

const NOW = new Date('2026-11-19T05:00:00Z')
const SEED_TIME = '<updated_at seed>'

/** Ganti nilai yang bergantung pada waktu seed dengan penanda tetap. */
function stable(result: PageResult): unknown {
  return JSON.parse(JSON.stringify(result), (key, value) => {
    if (key === 'modifiedTime' || key === 'dateModified') return SEED_TIME
    if (key === 'updatedAt' && value !== null) return SEED_TIME
    return value
  })
}

describe.skipIf(!process.env['DATABASE_URL'])('snapshot view model per jenis halaman', () => {
  const db = createDatabase({ connectionString: process.env['DATABASE_URL'] ?? '', max: 2, applicationName: 'vitest-snapshot' })
  const repos = createRepositories(db, { now: () => NOW })
  const builder = createPageBuilder(repos, { mediaUrl: createMediaUrlResolver(), now: () => NOW })
  afterAll(() => db.$client.end())

  const origins: Record<string, string> = {
    'kabar-tekno': 'https://tekno.localhost',
    'dapur-nusantara': 'https://kuliner.localhost',
  }
  const sites = new Map<string, SiteInfo>()

  async function build(code: string, url: string, home?: ResolvedSection[]): Promise<PageResult> {
    let site = sites.get(code)
    if (!site) {
      site = (await repos.sites.findByCode(code)) ?? undefined
      if (!site) throw new Error(`site seed ${code} tidak ada`)
      sites.set(code, site)
    }
    const parsed = new URL(url, 'http://x')
    return builder.build({ site, pathname: parsed.pathname, searchParams: parsed.searchParams, origin: origins[code] ?? '', layouts: home ? { home } : undefined })
  }

  // Chrome (header, menu, footer) sama untuk semua halaman satu site: cukup sekali.
  it.each(['kabar-tekno', 'dapur-nusantara'])('chrome %s', async (code) => {
    const result = await build(code, '/')
    if (result.kind !== 'render') throw new Error('bukan render')
    expect(stable({ ...result, page: { chrome: result.page.chrome } } as PageResult)).toMatchSnapshot()
  })

  it.each([
    ['home', 'kabar-tekno', '/'],
    ['article', 'kabar-tekno', '/review/ponsel-lipat-makin-murah'],
    ['article (site kedua)', 'dapur-nusantara', '/sumatera/rendang-padang-empuk'],
    ['page', 'dapur-nusantara', '/p/kontak'],
    ['category', 'kabar-tekno', '/category/gadget'],
    ['tag', 'dapur-nusantara', '/tag/pedas'],
    ['author', 'kabar-tekno', '/author/budi-santoso'],
    ['search', 'kabar-tekno', '/search?q=ponsel'],
    ['not-found', 'kabar-tekno', '/tidak/ada'],
    ['redirect permalink', 'kabar-tekno', '/gadget/ponsel-lipat-makin-murah'],
  ])('%s: %s %s', async (_label, code, url) => {
    const result = await build(code, url)
    // Chrome sudah disnapshot terpisah; di sini hanya status, vm, seo, issues.
    const snapshot = result.kind === 'render'
      ? { kind: result.kind, status: result.status, vm: result.page.vm, seo: result.page.seo, issues: result.issues }
      : result
    expect(stable(snapshot as PageResult)).toMatchSnapshot()
  })

  // Home dengan section (ADR-008). Layout sama dengan layouts di seed, sudah
  // dalam bentuk hasil registry template; core tidak mengenal manifest.
  const seedLayouts: Record<string, ResolvedSection[]> = {
    'kabar-tekno': [
      { type: 'hero', props: { source: 'featured', limit: 1 }, articles: { source: 'featured', limit: 1 } },
      { type: 'latest-grid', props: { limit: 6 }, articles: { source: 'latest', limit: 6 } },
      { type: 'category-strip', props: { categorySlug: 'gadget', limit: 4 }, articles: { source: 'category', slug: 'gadget', limit: 4 } },
    ],
    'dapur-nusantara': [
      { type: 'headline-list', props: { source: 'latest', limit: 5 }, articles: { source: 'latest', limit: 5 } },
      { type: 'category-strip', props: { categorySlug: 'resep', limit: 8 }, articles: { source: 'category', slug: 'resep', limit: 8 } },
    ],
  }

  it.each(Object.keys(seedLayouts))('home dengan section: %s', async (code) => {
    const result = await build(code, '/', seedLayouts[code])
    const snapshot = result.kind === 'render'
      ? { kind: result.kind, status: result.status, vm: result.page.vm, seo: result.page.seo, issues: result.issues }
      : result
    expect(stable(snapshot as PageResult)).toMatchSnapshot()
  })
})
