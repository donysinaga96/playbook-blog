// Resolver Host -> site untuk kedua mode deploy.
//  1. Unit: repository palsu, semua cabang keputusan.
//  2. Database dev yang di-seed (dilewati tanpa DATABASE_URL): normalisasi
//     Host sungguhan (huruf besar, port, titik di ujung) dan alias www.
import { createDatabase } from '@framework/db'
import { afterAll, describe, expect, it } from 'vitest'
import { createRepositories, type ResolvedSite, type SiteInfo } from '../repositories'
import { normalizeHost } from '../repositories/site-repository'
import { resolveSiteRequest } from './resolve'

function site(code: string): SiteInfo {
  return {
    id: `id-${code}`,
    code,
    name: code,
    defaultLocale: 'id',
    timezone: 'Asia/Jakarta',
    settings: {} as SiteInfo['settings'],
    logo: null,
    favicon: null,
  }
}

const tekno = site('kabar-tekno')
const kuliner = site('dapur-nusantara')
const legacy = site('arsip-lama')

/** domain -> [site, isPrimary]; primary dihitung dari isi tabel ini. */
const domains: Record<string, [SiteInfo, boolean]> = {
  'tekno.test': [tekno, true],
  'www.tekno.test': [tekno, false],
  'kuliner.test': [kuliner, true],
  'lama.test': [legacy, false], // site tanpa domain primary
}

const fakeSites = {
  async findByDomain(host: string): Promise<ResolvedSite | null> {
    const domain = normalizeHost(host)
    const entry = domain ? domains[domain] : undefined
    if (!domain || !entry) return null
    const [s, isPrimary] = entry
    const primary = Object.entries(domains).find(([, [other, p]]) => other === s && p)?.[0] ?? null
    return { site: s, matchedDomain: domain, primaryDomain: primary, isPrimary }
  },
}

describe('resolveSiteRequest (unit)', () => {
  const multi = { mode: 'multi' } as const
  const singleTekno = { mode: 'single', siteCode: 'kabar-tekno' } as const

  it('multi: setiap site dilayani di domain primary-nya', async () => {
    expect(await resolveSiteRequest(multi, fakeSites, 'tekno.test')).toMatchObject({ kind: 'site', resolved: { site: { code: 'kabar-tekno' } } })
    expect(await resolveSiteRequest(multi, fakeSites, 'kuliner.test')).toMatchObject({ kind: 'site', resolved: { site: { code: 'dapur-nusantara' } } })
  })

  it('multi: Host huruf besar dan ber-port tetap cocok', async () => {
    expect(await resolveSiteRequest(multi, fakeSites, 'Tekno.TEST:3000')).toMatchObject({ kind: 'site', resolved: { matchedDomain: 'tekno.test' } })
  })

  it('alias -> redirect ke domain primary', async () => {
    expect(await resolveSiteRequest(multi, fakeSites, 'WWW.tekno.test:3000')).toMatchObject({ kind: 'redirect', toHost: 'tekno.test' })
  })

  it('alias tanpa domain primary tetap dilayani, tidak di-redirect', async () => {
    expect(await resolveSiteRequest(multi, fakeSites, 'lama.test')).toMatchObject({ kind: 'site', resolved: { site: { code: 'arsip-lama' } } })
  })

  it.each(['tidak-ada.test', 'localhost', '', '127.0.0.1', 'tekno.test/admin'])('Host tak dikenal atau tidak valid (%j) -> not-found', async (host) => {
    expect(await resolveSiteRequest(multi, fakeSites, host)).toEqual({ kind: 'not-found', reason: 'unknown-host' })
  })

  it('single: hanya domain milik SITE_CODE yang dilayani', async () => {
    expect(await resolveSiteRequest(singleTekno, fakeSites, 'tekno.test')).toMatchObject({ kind: 'site' })
    expect(await resolveSiteRequest(singleTekno, fakeSites, 'www.tekno.test')).toMatchObject({ kind: 'redirect', toHost: 'tekno.test' })
  })

  it('single: domain site lain di database yang sama ditolak', async () => {
    expect(await resolveSiteRequest(singleTekno, fakeSites, 'kuliner.test')).toEqual({ kind: 'not-found', reason: 'other-site' })
  })

  it('single: Host tak dikenal -> not-found', async () => {
    expect(await resolveSiteRequest(singleTekno, fakeSites, 'tidak-ada.test')).toEqual({ kind: 'not-found', reason: 'unknown-host' })
  })
})

describe.skipIf(!process.env['DATABASE_URL'])('resolveSiteRequest (database dev, role blog_app)', () => {
  const db = createDatabase({ connectionString: process.env['DATABASE_URL'] ?? '', max: 2, applicationName: 'vitest-resolve' })
  const { sites } = createRepositories(db)
  afterAll(() => db.$client.end())

  it('multi: dua site dari seed', async () => {
    expect(await resolveSiteRequest({ mode: 'multi' }, sites, 'tekno.localhost')).toMatchObject({ kind: 'site', resolved: { site: { code: 'kabar-tekno' } } })
    expect(await resolveSiteRequest({ mode: 'multi' }, sites, 'kuliner.localhost')).toMatchObject({ kind: 'site', resolved: { site: { code: 'dapur-nusantara' } } })
  })

  it('huruf besar, port, dan titik di ujung', async () => {
    expect(await resolveSiteRequest({ mode: 'multi' }, sites, 'TEKNO.LocalHost.:3000')).toMatchObject({ kind: 'site', resolved: { matchedDomain: 'tekno.localhost' } })
  })

  it('alias www -> redirect 301 ke primary', async () => {
    expect(await resolveSiteRequest({ mode: 'multi' }, sites, 'www.tekno.localhost')).toMatchObject({ kind: 'redirect', toHost: 'tekno.localhost' })
  })

  it('single dapur-nusantara: domain kabar-tekno ditolak', async () => {
    const mode = { mode: 'single', siteCode: 'dapur-nusantara' } as const
    expect(await resolveSiteRequest(mode, sites, 'kuliner.localhost')).toMatchObject({ kind: 'site' })
    expect(await resolveSiteRequest(mode, sites, 'tekno.localhost')).toEqual({ kind: 'not-found', reason: 'other-site' })
  })

  it('Host tak dikenal', async () => {
    expect(await resolveSiteRequest({ mode: 'multi' }, sites, 'evil.example.com')).toEqual({ kind: 'not-found', reason: 'unknown-host' })
  })
})
