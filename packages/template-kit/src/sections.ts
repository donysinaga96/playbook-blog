// Section: potongan halaman (hero, daftar terbaru, strip kategori, ...) yang
// disusun per site lewat site_themes.layouts (ADR-008).
//
//   manifest base:   sections: { 'latest-grid': defineSection({ props, data }) }
//   site_themes:     layouts: { home: [{ type: 'latest-grid', props: { limit: 6 } }] }
//   resolveLayout:   -> [{ type, props tervalidasi, articles: permintaan data }]
//   core:            menjalankan permintaan data -> SectionView di view model
//
// Komponen section hanya ada di template base dan dipakai bersama (ADR-005);
// manifest menyatakan skema props dan data yang dibutuhkan dengan kosakata
// di bawah. Core yang mengambil data, template tidak pernah query.
//
// Data buruk tidak membuat halaman crash: section yang tidak dikenal atau
// props-nya salah dilewati dan dicatat; layout yang kosong atau rusak
// diganti defaultLayouts dari manifest.
import { z } from 'zod'
import { isPlainObject } from './objects'

/** Sumber artikel yang bisa diminta section. Menambah sumber = versi minor template-kit + dukungan di core. */
export const ARTICLE_SOURCES = ['latest', 'featured', 'category', 'tag'] as const
export type ArticleSource = (typeof ARTICLE_SOURCES)[number]

/** Permintaan data satu section; dijalankan core. */
export interface ArticlesRequest {
  source: ArticleSource
  /** Wajib untuk source category dan tag. */
  slug?: string
  /** Jumlah artikel, 1..SECTION_LIMITS.maxArticles. */
  limit: number
}

/** Batas agar satu baris config tidak memicu query tanpa batas. Dijaga di sini dan diulang di core. */
export const SECTION_LIMITS = Object.freeze({
  /** Artikel per section. */
  maxArticles: 12,
  /** Section per halaman; sisanya dibuang dan dicatat. */
  maxSectionsPerPage: 8,
})

/** Jenis halaman yang punya layout section. Saat ini hanya home. */
export const LAYOUT_PAGES = ['home'] as const
export type LayoutPage = (typeof LAYOUT_PAGES)[number]

export interface SectionInput<P extends z.ZodObject> {
  /** Skema props; field opsional memakai .default() agar props kosong tetap valid. */
  props: P
  /** Data yang dibutuhkan section; null = tanpa data. Tanpa `data` = section tanpa data. */
  data?: (props: z.output<P>) => ArticlesRequest | null
}

export interface SectionDefinition {
  readonly props: z.ZodObject
  readonly data: (props: Record<string, unknown>) => ArticlesRequest | null
}

export function defineSection<P extends z.ZodObject>(input: SectionInput<P>): SectionDefinition {
  const data = input.data
  return Object.freeze({
    props: input.props,
    data: data ? (props: Record<string, unknown>) => data(props as z.output<P>) : () => null,
  })
}

/** Bentuk satu item layout seperti disimpan di site_themes.layouts. */
export interface LayoutItem {
  type: string
  props?: Record<string, unknown>
}

/** Section yang sudah divalidasi, siap dijalankan core. Hanya data JSON. */
export interface ResolvedSection {
  type: string
  props: Record<string, unknown>
  articles: ArticlesRequest | null
}

export type ResolvedLayouts = Record<LayoutPage, ResolvedSection[]>

export interface ResolveLayoutInput {
  sections: Readonly<Record<string, SectionDefinition>>
  /** Nilai mentah layouts[page] dari database. */
  raw: unknown
  /** defaultLayouts[page] dari manifest; dipakai bila raw kosong atau tidak valid. */
  fallback: readonly LayoutItem[]
  /** Untuk pesan issue, mis. 'layouts.home'. */
  label: string
}

export interface ResolveLayoutResult {
  sections: ResolvedSection[]
  issues: string[]
}

/** Validasi layout satu halaman (aturan di atas). */
export function resolveLayout(input: ResolveLayoutInput): ResolveLayoutResult {
  const { sections, raw, fallback, label } = input
  const useFallback = (issues: string[]): ResolveLayoutResult => {
    const resolved = resolveItems(sections, fallback, `${label} (default)`)
    return { sections: resolved.sections, issues: [...issues, ...resolved.issues] }
  }

  if (raw === undefined || raw === null) return useFallback([])
  if (!Array.isArray(raw)) return useFallback([`${label}: bukan array, memakai default`])
  if (raw.length === 0) return useFallback([])

  const resolved = resolveItems(sections, raw, label)
  if (resolved.sections.length === 0) {
    return useFallback([...resolved.issues, `${label}: tidak ada section yang valid, memakai default`])
  }
  return resolved
}

function resolveItems(sections: Readonly<Record<string, SectionDefinition>>, items: readonly unknown[], label: string): ResolveLayoutResult {
  const issues: string[] = []
  const out: ResolvedSection[] = []
  let overflow = false

  items.forEach((item, index) => {
    const at = `${label}[${index}]`
    if (out.length >= SECTION_LIMITS.maxSectionsPerPage) {
      overflow = true
      return
    }
    if (!isPlainObject(item) || typeof item['type'] !== 'string') {
      issues.push(`${at}: bukan section ({ type, props }), dilewati`)
      return
    }
    const type = item['type']
    const definition = Object.hasOwn(sections, type) ? sections[type] : undefined
    if (!definition) {
      issues.push(`${at}: section "${type}" tidak dikenal, dilewati`)
      return
    }
    const rawProps = item['props'] ?? {}
    const parsed = definition.props.safeParse(rawProps)
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => `${i.path.join('.') || '(akar)'}: ${i.message}`).join('; ')
      issues.push(`${at}: props section "${type}" tidak valid (${detail}), dilewati`)
      return
    }
    const props = parsed.data as Record<string, unknown>

    let articles: ArticlesRequest | null
    try {
      articles = normalizeRequest(definition.data(props))
    } catch (error) {
      issues.push(`${at}: data section "${type}" tidak valid (${error instanceof Error ? error.message : String(error)}), dilewati`)
      return
    }
    out.push({ type, props, articles })
  })

  if (overflow) issues.push(`${label}: lebih dari ${SECTION_LIMITS.maxSectionsPerPage} section, sisanya diabaikan`)
  return { sections: out, issues }
}

const requestSchema = z.object({
  source: z.enum(ARTICLE_SOURCES),
  slug: z.string().trim().min(1).max(200).optional(),
  limit: z.number().int(),
})

/** Bentuk permintaan dicek ulang dan limit dijepit ke 1..maxArticles. */
function normalizeRequest(request: ArticlesRequest | null): ArticlesRequest | null {
  if (request === null) return null
  const parsed = requestSchema.safeParse(request)
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  const { source, slug } = parsed.data
  if ((source === 'category' || source === 'tag') && !slug) throw new Error(`source ${source} butuh slug`)
  const limit = Math.min(Math.max(parsed.data.limit, 1), SECTION_LIMITS.maxArticles)
  return slug && (source === 'category' || source === 'tag') ? { source, slug, limit } : { source, limit }
}
