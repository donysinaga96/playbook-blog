// Bentuk sites.settings (JSONB): identitas dan default non-visual sebuah
// site. Tampilan (token, layout) ada di site_themes, bukan di sini.
// Database hanya memastikan settings berupa object; isinya divalidasi di sini.
import { z } from 'zod'

const httpsUrl = z.url({ protocol: /^https$/ }).max(2_048)

// Pola permalink artikel. Wajib memuat :slug; token lain yang boleh dipakai:
//   :category (slug kategori), :year, :month
const PERMALINK_TOKENS = [':category', ':year', ':month', ':slug'] as const
const permalink = z
  .string()
  .max(200)
  .refine((p) => p.startsWith('/') && !p.startsWith('//'), 'harus diawali satu "/"')
  .refine((p) => p.split('/').filter(Boolean).every(isValidSegment), 'hanya :category, :year, :month, :slug')
  .refine((p) => p.split('/').includes(':slug'), 'wajib memuat :slug sebagai satu segmen')

function isValidSegment(segment: string): boolean {
  return (PERMALINK_TOKENS as readonly string[]).includes(segment)
}

export const DEFAULT_PERMALINK = '/:category/:slug'

export const siteSettingsSchema = z.object({
  tagline: z.string().trim().max(160).optional(),
  permalink: permalink.default(DEFAULT_PERMALINK),
  seo: z
    .object({
      // Harus memuat %s, tempat judul halaman: "%s | Kabar Tekno".
      titleTemplate: z.string().max(120).refine((t) => t.includes('%s'), 'harus memuat %s').optional(),
      defaultDescription: z.string().trim().max(320).optional(),
      // Media milik site; keanggotaan site dicek di service.
      defaultOgImageId: z.uuid().optional(),
    })
    .default({}),
  social: z
    .object({
      x: httpsUrl.optional(),
      facebook: httpsUrl.optional(),
      instagram: httpsUrl.optional(),
      youtube: httpsUrl.optional(),
      tiktok: httpsUrl.optional(),
    })
    .default({}),
  analytics: z
    .object({
      googleAnalyticsId: z.string().regex(/^G-[A-Z0-9]{4,}$/).optional(),
    })
    .default({}),
})

export type SiteSettings = z.infer<typeof siteSettingsSchema>

/**
 * Membaca settings dari database atau input admin. Key yang tidak dikenal
 * dibuang, default diisi. Melempar ZodError bila nilai yang dikenal tidak valid.
 */
export function parseSiteSettings(raw: unknown): SiteSettings {
  return siteSettingsSchema.parse(raw)
}
