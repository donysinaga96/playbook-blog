// Pratinjau tema (usulan M4-D): /admin/preview/<kode-site>/<path> dirender
// SSR di host admin (mode multi) atau domain site (mode single), dengan
// template site dan config DRAF (?draft=<id>, utils/preview-drafts.ts).
// Theme aktif tidak tersentuh; tanpa draf, pratinjau memakai theme aktif.
// Halaman Vue-nya pages/admin/preview/[...path].vue (segmen statis, jadi
// tidak tertukar dengan pages/admin/[site]/* walau kode site = 'media').
//
// Halaman dibangun oleh pembangun halaman publik yang sama (ADR-007), lalu
// dirender pages/[...slug].vue seperti halaman biasa. noindex, tanpa cache,
// hanya bisa dibingkai dari origin yang sama.
import { getRequestURL, sendRedirect, setResponseStatus, type RequestEvent } from 'nuxt/server'
import { requireAdmin, routedPath } from './admin'
import { useRepositories } from './database'
import { usePreviewPageBuilder } from './pages'
import { getPreviewDraft } from './preview-drafts'
import { resolveSiteTheme, templateManifests } from './templates'

export const PREVIEW_PREFIX = '/admin/preview/'

export function isPreviewPath(pathname: string): boolean {
  return routedPath(pathname).startsWith(PREVIEW_PREFIX)
}

/** Isi event.context (site, theme, page) untuk pratinjau, seperti middleware halaman publik. */
export async function preparePreview(event: RequestEvent) {
  const url = getRequestURL(event, { xForwardedProto: true })
  // Galat dijawab teks polos dengan status yang benar: di build produksi,
  // galat yang dilempar di path /admin/** dirender sebagai halaman SPA (404).
  let admin
  try {
    admin = await requireAdmin(event)
  } catch (error) {
    return plain(event, (error as { statusCode?: number }).statusCode ?? 401, 'Tidak diizinkan. Masuk ke admin dulu.')
  }
  const [code = '', ...parts] = routedPath(url.pathname).slice(PREVIEW_PREFIX.length).split('/')
  if (!admin.sites.some((s) => s.code === code)) return plain(event, 404, 'Site tidak ditemukan.')
  const repos = useRepositories()
  const site = await repos.sites.findByCode(code)
  if (!site) return plain(event, 404, 'Site tidak ditemukan.')

  const draftId = url.searchParams.get('draft')
  const draft = getPreviewDraft(draftId, admin.user.id, site.id)
  // Parameter pratinjau bukan bagian halaman site (mis. tidak boleh ikut pencarian).
  url.searchParams.delete('draft')
  const stored = draft
    ? { templateKey: draft.templateKey, templateVersion: templateManifests.get(draft.templateKey).version, tokens: draft.tokens, options: draft.options, layouts: draft.layouts }
    : await repos.sites.getActiveTheme(site.id)
  const theme = resolveSiteTheme(site, stored)

  const prefix = `${PREVIEW_PREFIX}${code}`
  const built = await usePreviewPageBuilder().build({
    site,
    pathname: `/${parts.join('/')}`,
    searchParams: url.searchParams,
    origin: `${url.origin}${prefix}`,
    layouts: theme.layouts,
  })
  const headers = event.res.headers
  headers.set('cache-control', 'no-store')
  headers.set('x-robots-tag', 'noindex, nofollow')
  headers.set('x-frame-options', 'SAMEORIGIN')
  if (built.kind === 'redirect') {
    // Redirect internal tetap di dalam pratinjau; tujuan luar dibiarkan.
    const target = built.location.startsWith('/') ? new URL(`${prefix}${built.location}`, url.origin) : null
    if (target && draftId) target.searchParams.set('draft', draftId)
    return sendRedirect(event, target ? `${target.pathname}${target.search}` : built.location, built.status)
  }
  event.context.site = site
  event.context.siteOrigin = `${url.origin}${prefix}`
  event.context.theme = theme
  event.context.page = { status: built.status, ...built.page }
  event.context.themePreview = { draft: Boolean(draft) }
}

function plain(event: RequestEvent, status: number, text: string) {
  setResponseStatus(event, status)
  event.res.headers.set('content-type', 'text/plain; charset=utf-8')
  event.res.headers.set('cache-control', 'no-store')
  return `${text}\n`
}
