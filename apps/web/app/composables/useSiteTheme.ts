// State halaman untuk request ini. Diisi plugin site.server.ts di server
// dari event.context (ADR-007), lalu ikut ke browser lewat payload useState.
// Hanya data JSON; komponen diambil dari registry template.
import type { SeoMeta } from '@framework/core'
import type { ChromeView, PageViewModel, ResolvedTheme } from '@framework/template-kit'

export function useSiteTheme() {
  return useState<ResolvedTheme | null>('site-theme', () => null)
}

export interface PageState {
  status: 200 | 404
  chrome: ChromeView
  vm: PageViewModel
  seo: SeoMeta
}

/** Null untuk request tanpa site atau tanpa halaman (mis. /api yang tidak ada). */
export function usePageState() {
  return useState<PageState | null>('site-page', () => null)
}
