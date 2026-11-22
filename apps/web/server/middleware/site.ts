// Host request -> site, untuk setiap request (ADR-001).
//
//   site ditemukan  -> event.context.site / siteDomain; untuk request
//                      halaman juga theme yang sudah diselesaikan
//                      (event.context.theme) + view model (event.context.page),
//                      atau redirect (permalink kanonik, tabel redirects)
//   domain alias    -> 301 ke domain primary (path dan query dipertahankan)
//   tidak dikenal   -> 404 netral, tanpa template dan tanpa nama site lain
//
// Admin (ADR-009): mode multi -> path admin hanya di ADMIN_HOST (path lain
// di host itu diarahkan ke /admin, path admin di domain site 404); mode
// single -> path admin di domain site SITE_CODE, tanpa view model.
//
// Host dibaca dari header Host, bukan X-Forwarded-Host: header itu bisa
// dipalsukan klien. Reverse proxy di produksi wajib meneruskan Host asli.
import { normalizeHost, resolveSiteRequest } from '@framework/core'
import { defineEventHandler, getRequestHost, getRequestURL, sendRedirect, setResponseStatus, type RequestEvent } from 'nuxt/server'
import { isAdminPath, useAdminConfig } from '../utils/admin'
import { NO_STORE, setPublicCache } from '../utils/cache-control'
import { useRepositories } from '../utils/database'
import { usePageBuilder } from '../utils/pages'
import { resolveSiteTheme } from '../utils/templates'
import { isPreviewPath, preparePreview } from '../utils/theme-preview'
import { useSiteMode } from '../utils/site-mode'
import { log } from '../utils/log'

/** Route yang tidak butuh site: health check container dan aset build Nuxt. */
const BYPASS_PREFIXES = ['/api/health', '/_nuxt/', '/__nuxt']
/** Route yang butuh site tetapi bukan halaman: dilayani server/routes, tanpa theme dan view model. */
const NON_PAGE_PREFIXES = ['/api/', '/media/', '/sitemap.xml', '/robots.txt', '/rss.xml']

export default defineEventHandler(async (event) => {
  // X-Forwarded-Proto hanya memengaruhi skema URL redirect ke domain primary.
  const url = getRequestURL(event, { xForwardedProto: true })
  if (BYPASS_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return

  const admin = useAdminConfig()
  const adminPath = isAdminPath(url.pathname)
  if (admin.enabled && admin.mode === 'multi' && normalizeHost(getRequestHost(event)) === admin.host) {
    if (adminPath) return isPreviewPath(url.pathname) ? preparePreview(event) : adminNoStore(event)
    return sendRedirect(event, '/admin', 302)
  }
  if (adminPath && (!admin.enabled || admin.mode === 'multi')) return notFound(event)

  const result = await resolveSiteRequest(useSiteMode(), useRepositories().sites, getRequestHost(event))

  if (result.kind === 'site') {
    const { site, matchedDomain, primaryDomain } = result.resolved
    event.context.site = site
    event.context.siteDomain = matchedDomain
    // URL absolut (canonical, og:url, sitemap, RSS) selalu di domain primary.
    // Port ikut bila request memakainya (dev :3000); di belakang proxy biasanya kosong.
    event.context.siteOrigin = `${url.protocol}//${primaryDomain ?? matchedDomain}${url.port ? `:${url.port}` : ''}`
    if (adminPath) return isPreviewPath(url.pathname) ? preparePreview(event) : adminNoStore(event)
    if (NON_PAGE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return

    // Halaman publik: theme diselesaikan dulu (layout section menentukan data
    // home, ADR-008), lalu view model dibangun di sini, bukan di Vue (ADR-007).
    const theme = resolveSiteTheme(site, await useRepositories().sites.getActiveTheme(site.id))
    const built = await usePageBuilder().build({
      site,
      pathname: url.pathname,
      searchParams: url.searchParams,
      origin: event.context.siteOrigin,
      layouts: theme.layouts,
    })
    if (built.kind === 'redirect') return sendRedirect(event, built.location, built.status)
    for (const issue of built.issues) log('warn', 'page issue', { id: event.context.requestId, site: site.code, path: url.pathname, issue })
    event.context.theme = theme
    event.context.page = { status: built.status, ...built.page }
    // TTL cache = batas keterlambatan artikel terjadwal (utils/cache-control.ts).
    setPublicCache(event, built.status)
    return
  }

  if (result.kind === 'redirect') {
    // API admin di domain alias (mode single): 301 mengubah POST menjadi GET
    // dan Origin tidak lagi cocok, jadi jawab 404; halaman /admin tetap diarahkan.
    if (adminPath && event.req.method !== 'GET' && event.req.method !== 'HEAD') return notFound(event)
    url.hostname = result.toHost
    return sendRedirect(event, url.toString(), 301)
  }

  return notFound(event)
})

/** Halaman admin (SPA) tidak pernah di-cache; API admin sudah diatur admin-guard. */
function adminNoStore(event: RequestEvent): undefined {
  event.res.headers.set('cache-control', NO_STORE)
  return undefined
}

function notFound(event: RequestEvent) {
  setResponseStatus(event, 404)
  event.res.headers.set('content-type', 'text/plain; charset=utf-8')
  event.res.headers.set('cache-control', 'no-store')
  return 'Situs tidak ditemukan.\n'
}
