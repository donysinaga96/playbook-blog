// Host request -> site, sesuai mode deploy (ADR-001).
//
// Fungsi murni di atas repository: tidak tahu soal HTTP. Middleware di
// apps/web menerjemahkan hasilnya menjadi event.context, 301, atau 404.
import type { ResolvedSite, SiteRepository } from '../repositories/site-repository'
import type { SiteMode } from './mode'

export type SiteResolution =
  /** Site ditemukan dan Host adalah domain yang benar untuk dilayani. */
  | { kind: 'site'; resolved: ResolvedSite }
  /** Host adalah alias (mis. www.*): alihkan permanen ke domain primary. */
  | { kind: 'redirect'; resolved: ResolvedSite; toHost: string }
  /** Tidak ada site untuk Host ini. Dijawab 404 netral, tanpa template. */
  | { kind: 'not-found'; reason: 'unknown-host' | 'other-site' }

/**
 * Mode multi: site mana pun yang memiliki domain itu.
 * Mode single: hanya site SITE_CODE; domain milik site lain di database yang
 * sama tetap ditolak ('other-site'), jadi Host tetap dicek.
 *
 * Alias dialihkan hanya bila site punya domain primary aktif yang berbeda;
 * tanpa primary, alias dilayani apa adanya agar site tidak hilang.
 */
export async function resolveSiteRequest(
  mode: SiteMode,
  sites: Pick<SiteRepository, 'findByDomain'>,
  host: string,
): Promise<SiteResolution> {
  const resolved = await sites.findByDomain(host)
  if (!resolved) return { kind: 'not-found', reason: 'unknown-host' }
  if (mode.mode === 'single' && resolved.site.code !== mode.siteCode) {
    return { kind: 'not-found', reason: 'other-site' }
  }
  const { isPrimary, primaryDomain, matchedDomain } = resolved
  if (!isPrimary && primaryDomain && primaryDomain !== matchedDomain) {
    return { kind: 'redirect', resolved, toHost: primaryDomain }
  }
  return { kind: 'site', resolved }
}
