import { createDatabase } from '@framework/db'
import { afterAll, describe, expect, it } from 'vitest'
import { createRepositories } from '../repositories'
import { createFeedBuilder, escapeXml, renderRobots, renderRss, renderSitemap } from './feeds'

describe('XML feed (murni)', () => {
  it('escape karakter khusus dan buang karakter kontrol', () => {
    expect(escapeXml(`a & b <c> "d" 'e'\u0000\u0007`)).toBe('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;')
  })

  it('sitemap', () => {
    expect(renderSitemap([{ loc: 'https://x.test/?a=1&b=2', lastmod: new Date('2026-11-10T01:00:00Z') }, { loc: 'https://x.test/p/a' }])).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + '  <url><loc>https://x.test/?a=1&amp;b=2</loc><lastmod>2026-11-10T01:00:00.000Z</lastmod></url>\n'
      + '  <url><loc>https://x.test/p/a</loc></url>\n'
      + '</urlset>\n',
    )
  })

  it('RSS: judul di-escape, guid tidak bergantung URL, tanpa item tetap sah', () => {
    const channel = { title: 'A & B', link: 'https://x.test/', description: 'd', language: 'id-id', selfUrl: 'https://x.test/rss.xml' }
    const xml = renderRss(channel, [{
      title: '<b>Judul</b>', link: 'https://x.test/a/b', guid: 'urn:uuid:1', pubDate: new Date('2026-11-10T01:00:00Z'),
      description: null, category: 'Umum', author: null,
    }])
    expect(xml).toContain('<title>A &amp; B</title>')
    expect(xml).toContain('<title>&lt;b&gt;Judul&lt;/b&gt;</title>')
    expect(xml).toContain('<guid isPermaLink="false">urn:uuid:1</guid>')
    expect(xml).toContain('<pubDate>Tue, 10 Nov 2026 01:00:00 GMT</pubDate>')
    expect(xml).toContain('<lastBuildDate>Tue, 10 Nov 2026 01:00:00 GMT</lastBuildDate>')
    expect(xml).not.toContain('<description></description>')
    expect(renderRss(channel, [])).not.toContain('<item>')
  })

  it('robots.txt menunjuk sitemap di origin primary', () => {
    expect(renderRobots('https://x.test')).toBe('User-agent: *\nDisallow: /api/\nDisallow: /search\n\nSitemap: https://x.test/sitemap.xml\n')
  })
})

describe.skipIf(!process.env['DATABASE_URL'])('feed per site (database dev, role blog_app)', () => {
  const db = createDatabase({ connectionString: process.env['DATABASE_URL'] ?? '', max: 2, applicationName: 'vitest-feeds' })
  const repos = createRepositories(db, { now: () => new Date('2026-11-19T05:00:00Z') })
  const feeds = createFeedBuilder(repos)
  afterAll(() => db.$client.end())

  async function siteOf(code: string) {
    const site = await repos.sites.findByCode(code)
    if (!site) throw new Error(code)
    return site
  }

  it('sitemap kabar-tekno: URL absolut di origin primary, tanpa artikel terjadwal/draf, tanpa data site lain', async () => {
    const xml = await feeds.sitemap(await siteOf('kabar-tekno'), 'https://tekno.localhost')
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    expect(locs).toEqual([
      'https://tekno.localhost/',
      'https://tekno.localhost/kecerdasan-buatan/cara-kerja-model-bahasa',
      'https://tekno.localhost/review/ponsel-lipat-makin-murah',
      'https://tekno.localhost/p/tentang-kami',
      'https://tekno.localhost/category/gadget',
      'https://tekno.localhost/category/kecerdasan-buatan',
      'https://tekno.localhost/category/review',
      'https://tekno.localhost/tag/android',
      'https://tekno.localhost/author/budi-santoso',
      'https://tekno.localhost/author/redaksi',
    ])
    expect(xml).not.toContain('laptop-terbaik')
    expect(xml).not.toContain('rendang')
  })

  it('RSS dapur-nusantara: terbaru dulu, link absolut, penulis', async () => {
    const xml = await feeds.rss(await siteOf('dapur-nusantara'), 'https://kuliner.localhost')
    expect([...xml.matchAll(/<link>([^<]+)<\/link>/g)].map((m) => m[1])).toEqual([
      'https://kuliner.localhost/',
      'https://kuliner.localhost/resep/sambal-matah-10-menit',
      'https://kuliner.localhost/sumatera/rendang-padang-empuk',
    ])
    expect(xml).toContain('<title>Dapur Nusantara</title>')
    expect(xml).toContain('<language>id-id</language>')
    expect(xml).toContain('<dc:creator>Redaksi Dapur</dc:creator>')
    expect(xml).toContain('<atom:link href="https://kuliner.localhost/rss.xml" rel="self" type="application/rss+xml"/>')
  })
})
