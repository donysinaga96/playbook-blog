// State halaman untuk request ini. Diisi plugin site.server.ts di server
// dari event.context (ADR-007), lalu ikut ke browser lewat payload useState.
// Hanya data JSON; komponen diambil dari registry template.
import type { SeoMeta } from '@framework/core'
import type { ChromeView, PageViewModel, ResolvedTheme } from '@framework/template-kit'

/**
 * Bagian theme yang dikirim ke browser. `issues` (diagnosis internal) dan
 * `layouts` (sudah dipakai core untuk view model) tidak ikut payload.
 */
export type PublicTheme = Omit<ResolvedTheme, 'issues' | 'layouts'>

export function useSiteTheme() {
  return useState<PublicTheme | null>('site-theme', () => null)
}

export interface PageState {
  status: 200 | 404
  chrome: ChromeView
  vm: PageViewModel
  seo: SeoMeta
}

/** true saat halaman dirender sebagai pratinjau tema di admin (M4 4.4). */
export function useThemePreview() {
  return useState<boolean>('theme-preview', () => false)
}

/** Null untuk request tanpa site atau tanpa halaman (mis. /api yang tidak ada). */
export function usePageState() {
  return useState<PageState | null>('site-page', () => null)
}
