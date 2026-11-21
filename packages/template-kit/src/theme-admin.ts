// Pengaturan tema dari admin (M4 4.4).
//
//  - describeTemplate: deskripsi template untuk form admin, dibangkitkan
//    dari skema manifest (JSON Schema dari Zod, dengan title/description
//    dari .meta()). Admin tidak menulis ulang daftar field.
//  - validateThemeDraft: validasi KETAT config yang akan disimpan atau
//    dipratinjau. Berbeda dengan resolveTheme (saat render: nilai salah ->
//    default), di sini nilai salah ditolak dengan galat per field.
import { z } from 'zod'
import type { TemplateManifest } from './manifest'
import { isPlainObject } from './objects'
import { LAYOUT_PAGES, SECTION_LIMITS, type LayoutItem, type LayoutPage } from './sections'
import { TokenError, tokensToCssVars, type TokenTree } from './tokens'

/** JSON Schema (draft 2020-12) apa adanya; dirender form admin. */
export type JsonSchema = Record<string, unknown>

export interface TemplateDescription {
  key: string
  name: string
  version: string
  tokens: { schema: JsonSchema; defaults: Record<string, unknown> }
  options: { schema: JsonSchema; defaults: Record<string, unknown> }
  /** Section yang bisa dipakai layout, dengan skema props-nya. */
  sections: { type: string; title: string; schema: JsonSchema }[]
  defaultLayouts: Record<LayoutPage, readonly LayoutItem[]>
}

const toSchema = (schema: z.ZodType): JsonSchema => z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as JsonSchema

export function describeTemplate(manifest: TemplateManifest): TemplateDescription {
  return {
    key: manifest.key,
    name: manifest.name,
    version: manifest.version,
    tokens: { schema: toSchema(manifest.tokens.schema), defaults: manifest.tokens.defaults },
    options: { schema: toSchema(manifest.options.schema), defaults: manifest.options.defaults },
    sections: Object.entries(manifest.sections).map(([type, def]) => {
      const schema = toSchema(def.props)
      return { type, title: typeof schema['title'] === 'string' ? schema['title'] : type, schema }
    }),
    defaultLayouts: manifest.defaultLayouts,
  }
}

export interface ThemeDraft {
  tokens: Record<string, unknown>
  options: Record<string, unknown>
  /** Hanya halaman yang diatur; halaman yang tidak ada = defaultLayouts template. */
  layouts: Partial<Record<LayoutPage, LayoutItem[]>>
}

export type DraftResult =
  | { ok: true; value: ThemeDraft }
  | { ok: false; issues: { field: string; message: string }[] }

/** Validasi ketat draf config untuk template ini. */
export function validateThemeDraft(manifest: TemplateManifest, raw: unknown, errorMap?: z.core.$ZodErrorMap): DraftResult {
  const issues: { field: string; message: string }[] = []
  const input = isPlainObject(raw) ? raw : {}
  const fromZod = (prefix: string, error: z.ZodError) => {
    for (const i of error.issues) issues.push({ field: [prefix, ...i.path].join('.'), message: i.message })
  }

  const tokens = manifest.tokens.schema.safeParse(input['tokens'] ?? {}, { error: errorMap })
  if (!tokens.success) fromZod('tokens', tokens.error)
  else {
    try {
      tokensToCssVars(tokens.data as TokenTree)
    } catch (error) {
      issues.push({ field: 'tokens', message: error instanceof TokenError ? error.message : String(error) })
    }
  }
  const options = manifest.options.schema.safeParse(input['options'] ?? {}, { error: errorMap })
  if (!options.success) fromZod('options', options.error)

  const layouts: Partial<Record<LayoutPage, LayoutItem[]>> = {}
  const rawLayouts = input['layouts'] ?? {}
  if (!isPlainObject(rawLayouts)) issues.push({ field: 'layouts', message: 'harus object per halaman' })
  else {
    for (const [page, items] of Object.entries(rawLayouts)) {
      if (!(LAYOUT_PAGES as readonly string[]).includes(page)) {
        issues.push({ field: `layouts.${page}`, message: 'halaman tidak punya layout section' })
        continue
      }
      if (items === undefined || items === null) continue
      if (!Array.isArray(items)) {
        issues.push({ field: `layouts.${page}`, message: 'harus daftar section' })
        continue
      }
      if (items.length > SECTION_LIMITS.maxSectionsPerPage) {
        issues.push({ field: `layouts.${page}`, message: `paling banyak ${SECTION_LIMITS.maxSectionsPerPage} section` })
      }
      const out: LayoutItem[] = []
      items.forEach((item, index) => {
        const at = `layouts.${page}.${index}`
        const type = isPlainObject(item) && typeof item['type'] === 'string' ? item['type'] : null
        const def = type && Object.hasOwn(manifest.sections, type) ? manifest.sections[type] : undefined
        if (!type || !def) {
          issues.push({ field: `${at}.type`, message: 'jenis section tidak dikenal' })
          return
        }
        const props = def.props.safeParse((item as Record<string, unknown>)['props'] ?? {}, { error: errorMap })
        if (!props.success) fromZod(`${at}.props`, props.error)
        else out.push({ type, props: props.data as Record<string, unknown> })
      })
      layouts[page as LayoutPage] = out
    }
  }

  if (issues.length) return { ok: false, issues }
  return { ok: true, value: { tokens: tokens.data as Record<string, unknown>, options: options.data as Record<string, unknown>, layouts } }
}
