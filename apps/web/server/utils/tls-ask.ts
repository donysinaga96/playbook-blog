// Izin sertifikat TLS on-demand (ADR-012, usulan M5-A).
//
// Caddy bertanya `GET /api/internal/tls-ask?domain=<host>` sebelum
// menerbitkan sertifikat untuk Host yang belum dikenalnya. Hanya domain
// yang benar-benar dilayani aplikasi yang diizinkan: domain site (primary
// atau alias, karena alias pun harus bisa menjawab 301 lewat HTTPS) dan
// ADMIN_HOST. Tanpa pemeriksaan ini siapa pun bisa mengarahkan domain
// sembarang ke VPS dan menghabiskan batas penerbitan Let's Encrypt.
import { normalizeHost, resolveSiteRequest, type SiteMode } from '@framework/core'

export interface TlsAskDeps {
  mode: SiteMode
  sites: Parameters<typeof resolveSiteRequest>[1]
  /** ADMIN_HOST yang sudah dinormalisasi; null bila admin nonaktif atau mode single. */
  adminHost: string | null
}

export async function isCertificateAllowed(domain: string | undefined, deps: TlsAskDeps): Promise<boolean> {
  const host = domain ? normalizeHost(domain) : null
  // normalizeHost membuang port; domain dengan port bukan permintaan Caddy yang sah.
  if (!host || host !== domain?.trim().toLowerCase().replace(/\.$/, '')) return false
  if (deps.adminHost && host === deps.adminHost) return true
  const result = await resolveSiteRequest(deps.mode, deps.sites, host)
  return result.kind !== 'not-found'
}
