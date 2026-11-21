// Registry manifest template untuk server (ADR-008): theme dan layout
// section diselesaikan di sini, sebelum view model dibangun, supaya core
// tahu data section yang harus diambil. Hanya entry ./manifest yang
// di-import (tanpa .vue/.css); komponen didaftarkan terpisah di
// app/templates.ts dengan daftar template yang sama.
import baseManifest from '@framework/template-base/manifest'
import { createTemplateRegistry, type ResolvedTheme, type StoredTheme } from '@framework/template-kit'
import magazineManifest from '@framework/template-magazine/manifest'
import newsManifest from '@framework/template-news/manifest'

export const templateManifests = createTemplateRegistry([baseManifest, magazineManifest, newsManifest], { fallback: 'base' })

// Issue theme yang sama cukup dicatat sekali per proses, bukan setiap request.
const loggedIssues = new Set<string>()
const MAX_LOGGED = 1000

/** Theme aktif site -> template + config + layout tervalidasi; issue dicatat ke log. */
export function resolveSiteTheme(site: { id: string; code: string }, stored: StoredTheme | null): ResolvedTheme {
  const theme = templateManifests.resolveTheme(stored)
  for (const issue of theme.issues) {
    const key = `${site.id}:${issue}`
    if (loggedIssues.has(key) || loggedIssues.size >= MAX_LOGGED) continue
    loggedIssues.add(key)
    console.warn(`[theme] site ${site.code}: ${issue}`)
  }
  return theme
}
