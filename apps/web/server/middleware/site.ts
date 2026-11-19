// Host request -> site, untuk setiap request (ADR-001).
//
//   site ditemukan  -> event.context.site / siteDomain; untuk request
//                      halaman juga theme + view model (event.context.page),
//                      atau redirect (permalink kanonik, tabel redirects)
//   domain alias    -> 301 ke domain primary (path dan query dipertahankan)
//   tidak dikenal   -> 404 netral, tanpa template dan tanpa nama site lain
//
// Host dibaca dari header Host, bukan X-Forwarded-Host: header itu bisa
// dipalsukan klien. Reverse proxy di produksi wajib meneruskan Host asli.
import { resolveSiteRequest } from '@framework/core'
import { defineEventHandler, getRequestHost, getRequestURL, sendRedirect, setResponseStatus } from 'nuxt/server'
import { useRepositories } from '../utils/database'
import { usePageBuilder } from '../utils/pages'
import { useSiteMode } from '../utils/site-mode'

/** Route yang tidak butuh site: health check container dan aset build Nuxt. */
const BYPASS_PREFIXES = ['/api/health', '/_nuxt/', '/__nuxt']
/** Route yang butuh site tetapi bukan halaman: dilayani server/routes, tanpa theme dan view model. */
const NON_PAGE_PREFIXES = ['/api/', '/media/', '/sitemap.xml', '/robots.txt', '/rss.xml']

export default defineEventHandler(async (event) => {
  // X-Forwarded-Proto hanya memengaruhi skema URL redirect ke domain primary.
  const url = getRequestURL(event, { xForwardedProto: true })
  if (BYPASS_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return

  const result = await resolveSiteRequest(useSiteMode(), useRepositories().sites, getRequestHost(event))

  if (result.kind === 'site') {
    const { site, matchedDomain, primaryDomain } = result.resolved
    event.context.site = site
    event.context.siteDomain = matchedDomain
    // URL absolut (canonical, og:url, sitemap, RSS) selalu di domain primary.
    // Port ikut bila request memakainya (dev :3000); di belakang proxy biasanya kosong.
    event.context.siteOrigin = `${url.protocol}//${primaryDomain ?? matchedDomain}${url.port ? `:${url.port}` : ''}`
    if (NON_PAGE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return

    // Halaman publik: view model dibangun di sini, bukan di Vue (ADR-007).
    const [theme, built] = await Promise.all([
      useRepositories().sites.getActiveTheme(site.id),
      usePageBuilder().build({ site, pathname: url.pathname, searchParams: url.searchParams, origin: event.context.siteOrigin }),
    ])
    if (built.kind === 'redirect') return sendRedirect(event, built.location, built.status)
    for (const issue of built.issues) console.warn(`[page] site ${site.code} ${url.pathname}: ${issue}`)
    event.context.theme = theme
    event.context.page = { status: built.status, ...built.page }
    return
  }

  if (result.kind === 'redirect') {
    url.hostname = result.toHost
    return sendRedirect(event, url.toString(), 301)
  }

  setResponseStatus(event, 404)
  event.res.headers.set('content-type', 'text/plain; charset=utf-8')
  event.res.headers.set('cache-control', 'no-store')
  return 'Situs tidak ditemukan.\n'
})
