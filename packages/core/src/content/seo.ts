// Kolom seo (JSONB) di articles, pages, dan categories:
//   { title, description, canonical, og_image_id, robots }
// Database hanya menjamin object. Saat dibaca untuk halaman publik, setiap
// key divalidasi sendiri: nilai yang salah diabaikan, bukan menggagalkan halaman.
import { z } from 'zod'

const fields = {
  /** Judul untuk <title> dan og:title, menggantikan judul konten. */
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(320),
  /** URL kanonik pengganti: path internal (/...) atau URL https absolut. */
  canonical: z.union([
    z.string().regex(/^\/(?!\/)\S*$/).max(2_048),
    z.url({ protocol: /^https$/ }).max(2_048),
  ]),
  og_image_id: z.uuid(),
  robots: z.enum(['noindex', 'noindex, follow', 'noindex, nofollow']),
}

export type ContentSeo = { [K in keyof typeof fields]?: z.output<(typeof fields)[K]> }

export function parseContentSeo(raw: unknown): ContentSeo {
  const out: Record<string, unknown> = {}
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out
  for (const [key, schema] of Object.entries(fields)) {
    const parsed = schema.safeParse((raw as Record<string, unknown>)[key])
    if (parsed.success) out[key] = parsed.data
  }
  return out as ContentSeo
}
