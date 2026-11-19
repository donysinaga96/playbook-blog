// Mode deploy (ADR-001), dibaca dari environment saat server start.
//
//   SITE_MODE=multi                         Host request -> site_domains
//   SITE_MODE=single  SITE_CODE=<kode>      satu site; domain tetap dicek
//
// Config yang salah atau ambigu ditolak, supaya proses gagal start alih-alih
// diam-diam melayani site yang salah.
import { z } from 'zod'

export type SiteMode =
  | { mode: 'multi' }
  | { mode: 'single'; siteCode: string }

/** Format sama dengan sites.code (lihat constraint sites_code_format). */
const siteCode = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'harus huruf kecil, angka, dan tanda hubung, misalnya kabar-tekno')
  .max(50)

const siteModeEnv = z.discriminatedUnion('SITE_MODE', [
  z.object({
    SITE_MODE: z.literal('multi'),
    SITE_CODE: z.undefined({ error: 'tidak boleh diisi saat SITE_MODE=multi (site dipilih dari Host)' }),
  }),
  z.object({
    SITE_MODE: z.literal('single'),
    SITE_CODE: siteCode,
  }),
], { error: 'SITE_MODE wajib diisi: single atau multi' })

export class SiteModeConfigError extends Error {
  override name = 'SiteModeConfigError'
}

/**
 * Membaca SITE_MODE dan SITE_CODE. Nilai kosong ('') dianggap tidak diisi.
 * Melempar SiteModeConfigError yang menyebut setiap variabel bermasalah.
 */
export function parseSiteMode(env: Record<string, string | undefined>): SiteMode {
  const pick = (key: string) => {
    const value = env[key]?.trim()
    return value === '' ? undefined : value
  }
  const result = siteModeEnv.safeParse({ SITE_MODE: pick('SITE_MODE'), SITE_CODE: pick('SITE_CODE') })
  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const key = issue.path.join('.') || 'SITE_MODE'
      return `${key}: ${issue.message}`
    })
    throw new SiteModeConfigError(`Konfigurasi mode site tidak valid -> ${problems.join('; ')}`)
  }
  const data = result.data
  return data.SITE_MODE === 'multi' ? { mode: 'multi' } : { mode: 'single', siteCode: data.SITE_CODE }
}
