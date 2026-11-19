import { and, eq, siteDomains, siteThemes, sites } from '@framework/db'
import { parseSiteSettings, type SiteSettings } from '../site/settings'
import { loadMedia } from './shared'
import type { MediaRef, RepositoryContext, SiteId, SiteScoped } from './types'

export interface SiteInfo {
  id: SiteId
  code: string
  name: string
  defaultLocale: string
  timezone: string
  settings: SiteSettings
  logo: MediaRef | null
  favicon: MediaRef | null
}

export interface ResolvedSite {
  site: SiteInfo
  /** Domain yang cocok dengan Host request. */
  matchedDomain: string
  /** Domain primary site; null bila site belum punya domain primary aktif. */
  primaryDomain: string | null
  /** false untuk alias seperti www.*; resolver boleh mengalihkan ke primaryDomain. */
  isPrimary: boolean
}

export interface ActiveTheme {
  templateKey: string
  templateVersion: string
  /** JSON mentah; divalidasi skema manifest template (bukan di sini). */
  tokens: Record<string, unknown>
  options: Record<string, unknown>
  layouts: Record<string, unknown>
}

/**
 * Host -> bentuk yang disimpan di site_domains: huruf kecil, tanpa port,
 * tanpa titik di ujung. Mengembalikan null untuk nilai yang bukan hostname
 * (kosong, memuat path, spasi, atau userinfo).
 */
export function normalizeHost(host: string): string | null {
  const h = host.trim().toLowerCase().replace(/:\d{1,5}$/, '').replace(/\.$/, '')
  if (h === '' || h.length > 253) return null
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(h) ? h : null
}

const siteColumns = {
  id: sites.id,
  code: sites.code,
  name: sites.name,
  defaultLocale: sites.defaultLocale,
  timezone: sites.timezone,
  settings: sites.settings,
  logoMediaId: sites.logoMediaId,
  faviconMediaId: sites.faviconMediaId,
}

type SiteRow = {
  id: string
  code: string
  name: string
  defaultLocale: string
  timezone: string
  settings: unknown
  logoMediaId: string | null
  faviconMediaId: string | null
}

/**
 * Repository site.
 *
 * `findByDomain` dan `findByCode` adalah resolver: tugasnya MENEMUKAN siteId,
 * jadi satu-satunya fungsi yang tidak menerima siteId. Setelah site
 * ditemukan, semua query berikutnya memakai siteId itu. Hanya site berstatus
 * ACTIVE yang bisa ditemukan; SUSPENDED dan ARCHIVED diperlakukan tidak ada.
 */
export function createSiteRepository(ctx: RepositoryContext) {
  const { db } = ctx

  async function toSiteInfo(row: SiteRow): Promise<SiteInfo> {
    const refs = await loadMedia(ctx, row.id, [row.logoMediaId, row.faviconMediaId])
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      defaultLocale: row.defaultLocale,
      timezone: row.timezone,
      settings: parseSiteSettings(row.settings),
      logo: (row.logoMediaId && refs.get(row.logoMediaId)) || null,
      favicon: (row.faviconMediaId && refs.get(row.faviconMediaId)) || null,
    }
  }

  async function primaryDomainOf(siteId: SiteId): Promise<string | null> {
    const [row] = await db
      .select({ domain: siteDomains.domain })
      .from(siteDomains)
      .where(and(eq(siteDomains.siteId, siteId), eq(siteDomains.isPrimary, true), eq(siteDomains.status, 'ACTIVE')))
      .limit(1)
    return row?.domain ?? null
  }

  return {
    /** Mode multi-site: Host request -> site. */
    async findByDomain(host: string): Promise<ResolvedSite | null> {
      const domain = normalizeHost(host)
      if (!domain) return null
      const [row] = await db
        .select({ ...siteColumns, domain: siteDomains.domain, isPrimary: siteDomains.isPrimary })
        .from(siteDomains)
        .innerJoin(sites, eq(sites.id, siteDomains.siteId))
        .where(and(eq(siteDomains.domain, domain), eq(siteDomains.status, 'ACTIVE'), eq(sites.status, 'ACTIVE')))
        .limit(1)
      if (!row) return null
      return {
        site: await toSiteInfo(row),
        matchedDomain: row.domain,
        primaryDomain: await primaryDomainOf(row.id),
        isPrimary: row.isPrimary,
      }
    },

    /** Mode single-site: env SITE_CODE -> site. */
    async findByCode(code: string): Promise<SiteInfo | null> {
      const [row] = await db
        .select(siteColumns)
        .from(sites)
        .where(and(eq(sites.code, code), eq(sites.status, 'ACTIVE')))
        .limit(1)
      return row ? toSiteInfo(row) : null
    },

    /** Theme aktif site (maksimal satu, dijaga unique index). Null bila belum ada: core memakai base. */
    async getActiveTheme(siteId: SiteId): Promise<ActiveTheme | null> {
      const [row] = await db
        .select({
          templateKey: siteThemes.templateKey,
          templateVersion: siteThemes.templateVersion,
          tokens: siteThemes.tokens,
          options: siteThemes.options,
          layouts: siteThemes.layouts,
        })
        .from(siteThemes)
        .where(and(eq(siteThemes.siteId, siteId), eq(siteThemes.isActive, true)))
        .limit(1)
      if (!row) return null
      return {
        ...row,
        tokens: row.tokens as Record<string, unknown>,
        options: row.options as Record<string, unknown>,
        layouts: row.layouts as Record<string, unknown>,
      }
    },
  } satisfies Record<string, SiteScoped | ((arg: string) => Promise<unknown>)>
}

export type SiteRepository = ReturnType<typeof createSiteRepository>
