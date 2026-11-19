// Mode deploy (SITE_MODE / SITE_CODE) dibaca sekali per proses. Ini config
// proses, bukan state per request. Validasinya di @framework/core.
import { parseSiteMode, type SiteMode } from '@framework/core'

let siteMode: SiteMode | undefined

/** Melempar SiteModeConfigError bila env salah; plugin site-mode memanggilnya saat start. */
export function useSiteMode(): SiteMode {
  siteMode ??= parseSiteMode(process.env)
  return siteMode
}
