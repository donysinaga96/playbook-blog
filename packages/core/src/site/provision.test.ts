// Pembuatan site (M5 5.1b) terhadap database dev (dilewati tanpa DATABASE_URL).
// Site uji berkode unik dihapus di afterAll beserta isinya (CASCADE).
import { authors, createDatabase, eq, inArray, menus, siteDomains, siteMembers, sites, siteThemes } from '@framework/db'
import { afterAll, describe, expect, it } from 'vitest'
import { EditorError } from '../editor/errors'
import { createSiteProvisioner, type TemplateCatalog } from './provision'

const run = `p${process.pid}x${Date.now().toString(36)}`
const catalog: TemplateCatalog = { versionOf: (key) => ({ news: '1.0.0', magazine: '1.1.0' } as Record<string, string>)[key] ?? null, menuLocations: ['header', 'footer'] }

async function rejects(promise: Promise<unknown>, field: string) {
  const error = await promise.then(() => null, (e: unknown) => e)
  expect(error).toBeInstanceOf(EditorError)
  expect((error as EditorError).issues.map((i) => i.field)).toContain(field)
}

describe.skipIf(!process.env['DATABASE_URL'])('createSiteProvisioner (database dev, role blog_app)', () => {
  const db = createDatabase({ connectionString: process.env['DATABASE_URL'] ?? '', max: 2, applicationName: 'vitest-provision' })
  const provision = createSiteProvisioner(db)
  const A = `uji-${run}`
  const B = `uji-${run}-b`
  const codes = [A, B]

  afterAll(async () => {
    await db.delete(sites).where(inArray(sites.code, codes))
    await db.$client.end()
  })

  it('site lengkap: domain primary + alias, theme aktif tanpa config, menu, penulis, pemilik', async () => {
    const created = await provision.createSite({
      code: A, name: 'Site Uji', template: 'news', domain: `Uji-${run}.Localhost:3000`, aliases: [`www.uji-${run}.localhost`],
      owner: 'ADMIN@local.test', settings: { tagline: 'Tagline uji' },
    }, catalog)
    expect(created.domains).toEqual([`uji-${run}.localhost`, `www.uji-${run}.localhost`])
    const [site] = await db.select().from(sites).where(eq(sites.id, created.id))
    expect(site).toMatchObject({ status: 'ACTIVE', defaultLocale: 'id-ID', timezone: 'Asia/Jakarta' })
    expect(site?.settings).toMatchObject({ tagline: 'Tagline uji', permalink: '/:category/:slug' })
    const domains = await db.select({ domain: siteDomains.domain, isPrimary: siteDomains.isPrimary }).from(siteDomains).where(eq(siteDomains.siteId, created.id))
    expect(domains.filter((d) => d.isPrimary).map((d) => d.domain)).toEqual([`uji-${run}.localhost`])
    expect(await db.select({ key: siteThemes.templateKey, version: siteThemes.templateVersion, active: siteThemes.isActive, tokens: siteThemes.tokens }).from(siteThemes).where(eq(siteThemes.siteId, created.id)))
      .toEqual([{ key: 'news', version: '1.0.0', active: true, tokens: {} }])
    expect((await db.select({ l: menus.location }).from(menus).where(eq(menus.siteId, created.id))).map((m) => m.l).sort()).toEqual(['footer', 'header'])
    expect(await db.select({ slug: authors.slug }).from(authors).where(eq(authors.siteId, created.id))).toEqual([{ slug: 'redaksi' }])
    expect(await db.select({ role: siteMembers.role }).from(siteMembers).where(eq(siteMembers.siteId, created.id))).toEqual([{ role: 'OWNER' }])
  })

  it.each([
    ['kode dipakai', () => ({ code: A }), 'code'],
    ['kode huruf besar', () => ({ code: 'Uji' }), 'code'],
    ['domain dipakai site lain', () => ({ domain: 'tekno.localhost' }), 'domain'],
    ['domain dengan protokol', () => ({ domain: 'https://x.localhost' }), 'domain'],
    ['alias sama dengan domain lain di input', () => ({ aliases: [`x-${run}.localhost`, `x-${run}.localhost`] }), 'aliases'],
    ['template tidak terdaftar', () => ({ template: 'tidak-ada' }), 'template'],
    ['zona waktu tidak dikenal', () => ({ timezone: 'Mars/Olympus' }), 'timezone'],
    ['permalink tanpa :slug', () => ({ settings: { permalink: '/:category' } }), 'settings.permalink'],
    ['pemilik belum ada', () => ({ owner: `tidak-ada-${run}@local.test` }), 'owner'],
  ])('ditolak: %s', async (_name, override, field) => {
    await rejects(provision.createSite({ code: B, name: 'B', template: 'news', domain: `b-${run}.localhost`, ...override() }, catalog), field)
    expect(await db.select({ id: sites.id }).from(sites).where(eq(sites.code, B))).toEqual([])
  })

  it('domain: tambah, pindahkan primary, hapus alias; primary dan domain site lain dilindungi', async () => {
    const code = A
    expect(await provision.addDomain(code, `Baru-${run}.localhost`, true)).toBe(`baru-${run}.localhost`)
    expect((await provision.listDomains(code))[0]).toMatchObject({ domain: `baru-${run}.localhost`, isPrimary: true })
    await rejects(provision.removeDomain(code, `baru-${run}.localhost`), 'domain')
    await provision.setPrimaryDomain(code, `uji-${run}.localhost`)
    await provision.removeDomain(code, `baru-${run}.localhost`)
    expect((await provision.listDomains(code)).map((d) => d.domain)).toEqual([`uji-${run}.localhost`, `www.uji-${run}.localhost`])
    await rejects(provision.addDomain(code, 'kuliner.localhost'), 'domain')
    await expect(provision.removeDomain(code, 'kuliner.localhost')).rejects.toBeInstanceOf(EditorError)
    await expect(provision.addDomain('tidak-ada', `z-${run}.localhost`)).rejects.toBeInstanceOf(EditorError)
  })
})
