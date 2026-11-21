// Data per request yang diisi middleware server/middleware/site.ts.
// Disimpan di event.context, tidak di modul (ADR-001: tanpa state global SSR).
import type { SeoMeta, SiteInfo } from '@framework/core'
import type { ChromeView, PageViewModel, ResolvedTheme } from '@framework/template-kit'

declare module 'nuxt/schema' {
  interface RequestEventContext {
    /** Site yang melayani request ini. Tidak ada untuk route yang dilewati resolver (/api/health). */
    site?: SiteInfo
    /** Domain (sudah dinormalisasi) yang cocok dengan Host request. */
    siteDomain?: string
    /** Origin domain primary untuk URL absolut, mis. https://tekno.example. */
    siteOrigin?: string
    /**
     * Theme aktif yang sudah diselesaikan registry manifest (ADR-008): template
     * (bisa fallback), token, opsi, layout section. Hanya untuk request halaman.
     */
    theme?: ResolvedTheme
    /** Halaman publik siap render (ADR-007); tidak ada untuk /api, /media, dan redirect. */
    page?: { status: 200 | 404; chrome: ChromeView; vm: PageViewModel; seo: SeoMeta }
    /** Request pratinjau tema dari admin (M4 4.4); draft = memakai config draf dari sesi. */
    themePreview?: { draft: boolean }
  }
}

export {}
