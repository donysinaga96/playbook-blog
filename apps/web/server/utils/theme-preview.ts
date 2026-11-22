// Pratinjau tema (usulan M4-D): /admin/preview/<kode-site>/<path> dirender
// SSR di host admin (mode multi) atau domain site (mode single), dengan
// template site dan config DRAF (?draft=<id>, utils/preview-drafts.ts).
// Theme aktif tidak tersentuh; tanpa draf, pratinjau memakai theme aktif.
// Halaman Vue-nya pages/admin/preview/[...path].vue (segmen statis, jadi
// tidak tertukar dengan pages/admin/[site]/* walau kode site = 'media').
//
// ?generated=<id> (M5a 5a.3): pratinjau hasil AI sebagai artikel site itu,
// dengan theme aktif. Artikel sintetis disisipkan lewat withPreviewArticle,
// jadi tidak ada yang ditulis ke database.
//
// Halaman dibangun oleh pembangun halaman publik yang sama (ADR-007), lalu
// dirender pages/[...slug].vue seperti halaman biasa. noindex, tanpa cache,
// hanya bisa dibingkai dari origin yang sama.
import { createMediaUrlResolver, createPageBuilder, createUrlBuilder, EditorError, withPreviewArticle } from '@framework/core'
import { getRequestURL, sendRedirect, setResponseStatus, type RequestEvent } from 'nuxt/server'
import { requireAdmin, routedPath } from './admin'
import { useRepositories } from './database'
import { useMediaStorage } from './media'
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
  const site = await useRepositories().sites.findByCode(code)
  if (!site) return plain(event, 404, 'Site tidak ditemukan.')

  const prefix = `${PREVIEW_PREFIX}${code}`
  const generatedId = url.searchParams.get('generated')
  const built = generatedId
    ? await buildGenerated(site, generatedId, url, prefix)
    : await buildThemeDraft(site, admin.user.id, url, parts, prefix)
  if ('text' in built) return plain(event, built.status, built.text)
  const { result, theme, draftId } = built
  const headers = event.res.headers
  headers.set('cache-control', 'no-store')
  headers.set('x-robots-tag', 'noindex, nofollow')
  headers.set('x-frame-options', 'SAMEORIGIN')
  if (result.kind === 'redirect') {
    // Redirect internal tetap di dalam pratinjau; tujuan luar dibiarkan.
    const target = result.location.startsWith('/') ? new URL(`${prefix}${result.location}`, url.origin) : null
    if (target && draftId) target.searchParams.set('draft', draftId)
    return sendRedirect(event, target ? `${target.pathname}${target.search}` : result.location, result.status)
  }
  event.context.site = site
  event.context.siteOrigin = `${url.origin}${prefix}`
  event.context.theme = theme
  event.context.page = { status: result.status, ...result.page }
  event.context.themePreview = { draft: Boolean(draftId) }
}

type Site = NonNullable<Awaited<ReturnType<ReturnType<typeof useRepositories>['sites']['findByCode']>>>
type Built = { result: Awaited<ReturnType<ReturnType<typeof usePreviewPageBuilder>['build']>>; theme: ReturnType<typeof resolveSiteTheme>; draftId: string | null } | { status: number; text: string }

/** Halaman site dengan config tema draf (?draft=<id>) atau theme aktif. */
async function buildThemeDraft(site: Site, userId: string, url: URL, parts: string[], prefix: string): Promise<Built> {
  const repos = useRepositories()
  const draftId = url.searchParams.get('draft')
  const draft = getPreviewDraft(draftId, userId, site.id)
  // Parameter pratinjau bukan bagian halaman site (mis. tidak boleh ikut pencarian).
  url.searchParams.delete('draft')
  const stored = draft
    ? { templateKey: draft.templateKey, templateVersion: templateManifests.get(draft.templateKey).version, tokens: draft.tokens, options: draft.options, layouts: draft.layouts }
    : await repos.sites.getActiveTheme(site.id)
  const theme = resolveSiteTheme(site, stored)
  const result = await usePreviewPageBuilder().build({
    site,
    pathname: `/${parts.join('/')}`,
    searchParams: url.searchParams,
    origin: `${url.origin}${prefix}`,
    layouts: theme.layouts,
  })
  return { result, theme, draftId: draft ? draftId : null }
}

/** Hasil AI (?generated=<id>) sebagai artikel site itu, dengan theme aktif. */
async function buildGenerated(site: Site, id: string, url: URL, prefix: string): Promise<Built> {
  const repos = useRepositories()
  url.searchParams.delete('generated')
  let found
  try {
    found = await repos.generated.preview(site.id, id, useMediaStorage())
  } catch (error) {
    if (error instanceof EditorError && error.kind === 'not-found') {
      return { status: 404, text: error.message.startsWith('Hasil AI') ? 'Hasil AI tidak ditemukan.' : `${error.message}.` }
    }
    throw error
  }
  if (!found.preview) return { status: 422, text: 'Hasil AI ini masih punya galat. Perbaiki dulu, lalu buka pratinjau lagi.' }
  const theme = resolveSiteTheme(site, await repos.sites.getActiveTheme(site.id))
  const builder = createPageBuilder(
    { content: withPreviewArticle(repos.content, site.id, found.preview), menus: repos.menus },
    { mediaUrl: createMediaUrlResolver({ baseUrl: '/admin/preview-media' }) },
  )
  const { article } = found.preview
  const urls = createUrlBuilder({ permalink: site.settings.permalink, timeZone: site.timezone })
  const result = await builder.build({
    site,
    pathname: urls.article({ slug: article.slug, categorySlug: article.category.slug, publishedAt: article.publishedAt }),
    searchParams: url.searchParams,
    origin: `${url.origin}${prefix}`,
    layouts: theme.layouts,
  })
  return { result, theme, draftId: null }
}

function plain(event: RequestEvent, status: number, text: string) {
  setResponseStatus(event, status)
  event.res.headers.set('content-type', 'text/plain; charset=utf-8')
  event.res.headers.set('cache-control', 'no-store')
  return `${text}\n`
}
