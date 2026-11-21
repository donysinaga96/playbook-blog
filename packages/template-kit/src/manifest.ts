// Manifest dan definisi template (ADR-005, ADR-008).
//
// Satu paket template punya dua entry:
//
//   ./manifest  defineManifest({ key, version, tokens, options, sections, defaultLayouts, ... })
//               Hanya data dan skema Zod, tanpa .vue/.css, sehingga bisa
//               di-import server (Nitro) untuk menyelesaikan theme sebelum
//               view model dibangun.
//   .           defineTemplate({ manifest, extends, layout, views })
//               Manifest + komponen Vue + CSS, untuk renderer.
//
//   export default defineManifest({
//     key: 'magazine', version: '1.0.0', name: 'Magazine', extends: baseManifest,
//     tokens: { defaults: { color: { primary: '#0f62fe' } } },
//   })
//
// Manifest dengan `extends` mewarisi semua yang tidak ia definisikan sendiri:
// skema token/opsi, default (digabung per key), lokasi menu, slot iklan,
// section, dan defaultLayouts. Manifest tanpa `extends` (base) wajib lengkap.
// Section hanya didefinisikan base, karena komponennya hanya ada di base.
//
// Semua dicek saat defineManifest/defineTemplate dipanggil, yaitu saat modul
// di-import, jadi manifest yang salah langsung gagal di test dan build.
//
// migrateConfig (lihat migrations.ts) milik template itu sendiri dan tidak
// diwariskan. Belum didukung: override komponen (pengecualian, wajib ADR).
import type { Component } from 'vue'
import { z } from 'zod'
import { migrationProblems, type ConfigMigration } from './migrations'
import { isPlainObject, mergeDeep } from './objects'
import { LAYOUT_PAGES, resolveLayout, type LayoutItem, type LayoutPage, type SectionDefinition } from './sections'
import { TokenError, tokensToCssVars, type TokenTree } from './tokens'
import { VIEW_NAMES, type ViewName } from './view-models'

/** Komponen yang dimuat saat dibutuhkan: () => import('./views/Home.vue'). */
export type ComponentLoader = () => Promise<Component | { default: Component }>

/** Skema config: object Zod di level atas, agar bisa divalidasi per key. */
export type ConfigSchema = z.ZodObject

export interface ConfigInput {
  /** Wajib untuk template tanpa extends; bila diisi, menggantikan skema induk. */
  schema?: ConfigSchema
  /** Digabung per key di atas default induk, lalu divalidasi skema. */
  defaults: Record<string, unknown>
}

export interface ManifestInput {
  /** Huruf kecil, angka, tanda hubung; dipakai di site_themes.template_key dan kelas root .tpl-<key>. */
  key: string
  /** Semver, mis. 1.0.0. */
  version: string
  name: string
  extends?: TemplateManifest
  tokens?: ConfigInput
  options?: ConfigInput
  menuLocations?: string[]
  adSlots?: string[]
  /** Hanya untuk manifest tanpa extends (base). */
  sections?: Record<string, SectionDefinition>
  /** Susunan section bawaan per jenis halaman; dipakai bila layout site kosong atau rusak. */
  defaultLayouts?: Partial<Record<LayoutPage, LayoutItem[]>>
  /** Migrasi config tersimpan, dengan kunci versi tujuan. Wajib berisi X.0.0 untuk setiap versi mayor X >= 2. */
  migrateConfig?: Record<string, ConfigMigration>
}

export interface ConfigSpec {
  schema: ConfigSchema
  defaults: Record<string, unknown>
}

/** Hasil defineManifest: sudah lengkap, warisan sudah diterapkan. Bebas Vue/CSS. */
export interface TemplateManifest {
  readonly key: string
  readonly version: string
  readonly name: string
  /** Rantai pewarisan, dari template ini ke akar: ['magazine', 'base']. */
  readonly lineage: readonly string[]
  readonly tokens: ConfigSpec
  readonly options: ConfigSpec
  readonly menuLocations: readonly string[]
  readonly adSlots: readonly string[]
  readonly sections: Readonly<Record<string, SectionDefinition>>
  readonly defaultLayouts: Readonly<Record<LayoutPage, readonly LayoutItem[]>>
  readonly migrateConfig: Readonly<Record<string, ConfigMigration>>
}

export interface TemplateInput {
  manifest: TemplateManifest
  /** Definisi induk; wajib bila manifest punya extends, dan key-nya harus sama. */
  extends?: TemplateDefinition
  layout?: ComponentLoader
  views?: Partial<Record<ViewName, ComponentLoader>>
}

/** Manifest + komponen. Hasil defineTemplate; dipakai renderer Vue. */
export interface TemplateDefinition extends TemplateManifest {
  readonly layout: ComponentLoader
  readonly views: Readonly<Record<ViewName, ComponentLoader>>
}

export class TemplateDefinitionError extends Error {
  override name = 'TemplateDefinitionError'
}

const TEMPLATE_KEY = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

export function defineManifest(input: ManifestInput): TemplateManifest {
  const fail = (message: string): never => {
    throw new TemplateDefinitionError(`template "${input.key}": ${message}`)
  }

  if (!TEMPLATE_KEY.test(input.key)) fail('key harus huruf kecil, angka, dan tanda hubung, diawali huruf')
  if (!SEMVER.test(input.version)) fail(`version "${input.version}" bukan semver (mis. 1.0.0)`)
  if (input.name.trim() === '') fail('name wajib diisi')

  const parent = input.extends
  if (parent && parent.lineage.includes(input.key)) fail(`key sama dengan induknya (${parent.lineage.join(' -> ')})`)

  const tokens = resolveSpec('tokens', input.tokens, parent?.tokens, fail)
  const options = resolveSpec('options', input.options, parent?.options, fail)

  try {
    tokensToCssVars(tokens.defaults as TokenTree)
  } catch (error) {
    fail(`default tokens tidak bisa dijadikan CSS variable: ${error instanceof TokenError ? error.message : String(error)}`)
  }

  if (parent && input.sections) fail('sections hanya didefinisikan template base; template turunan memakai section induknya (ADR-008)')
  const sections = input.sections ? Object.freeze({ ...input.sections }) : (parent?.sections ?? Object.freeze({}))

  const defaultLayouts = {} as Record<LayoutPage, readonly LayoutItem[]>
  for (const page of LAYOUT_PAGES) {
    const items = input.defaultLayouts?.[page] ?? parent?.defaultLayouts[page] ?? []
    // Layout bawaan harus bersih: setiap section dikenal dan props-nya valid.
    const resolved = resolveLayout({ sections, raw: items, fallback: [], label: `defaultLayouts.${page}` })
    if (resolved.issues.length > 0) fail(resolved.issues.join('; '))
    defaultLayouts[page] = Object.freeze(items.map((item) => Object.freeze({ ...item })))
  }

  const migrations = Object.freeze({ ...(input.migrateConfig ?? {}) })
  const problems = migrationProblems(input.version, migrations)
  if (problems.length > 0) fail(problems.join('; '))

  return Object.freeze({
    key: input.key,
    version: input.version,
    name: input.name,
    lineage: Object.freeze([input.key, ...(parent?.lineage ?? [])]),
    tokens,
    options,
    menuLocations: Object.freeze([...(input.menuLocations ?? parent?.menuLocations ?? [])]),
    adSlots: Object.freeze([...(input.adSlots ?? parent?.adSlots ?? [])]),
    sections,
    defaultLayouts: Object.freeze(defaultLayouts),
    migrateConfig: migrations,
  })
}

export function defineTemplate(input: TemplateInput): TemplateDefinition {
  const { manifest } = input
  const fail = (message: string): never => {
    throw new TemplateDefinitionError(`template "${manifest.key}": ${message}`)
  }

  const parent = input.extends
  const manifestParent = manifest.lineage[1]
  if (manifestParent !== parent?.key) {
    fail(`extends (${parent?.key ?? 'tidak ada'}) harus sama dengan induk manifest (${manifestParent ?? 'tidak ada'})`)
  }

  const layout = input.layout ?? parent?.layout ?? fail('layout wajib untuk template tanpa extends')
  const views = { ...parent?.views, ...input.views }
  const missing = VIEW_NAMES.filter((name) => !views[name])
  if (missing.length > 0) fail(`view belum ada: ${missing.join(', ')}`)

  return Object.freeze({
    ...manifest,
    layout,
    views: Object.freeze(views as Record<ViewName, ComponentLoader>),
  })
}

function resolveSpec(
  label: 'tokens' | 'options',
  own: ConfigInput | undefined,
  inherited: ConfigSpec | undefined,
  fail: (message: string) => never,
): ConfigSpec {
  const schema = own?.schema ?? inherited?.schema ?? fail(`${label}.schema wajib untuk template tanpa extends`)
  if (!(schema instanceof z.ZodObject)) fail(`${label}.schema harus z.object(...)`)
  if (own && !isPlainObject(own.defaults)) fail(`${label}.defaults harus object`)

  const merged = mergeDeep(inherited?.defaults ?? {}, own?.defaults ?? {})
  const parsed = schema.safeParse(merged)
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.') || '(akar)'}: ${i.message}`).join('; ')
    fail(`${label}.defaults tidak lolos skema -> ${detail}`)
  }
  return Object.freeze({ schema, defaults: parsed.data as Record<string, unknown> })
}
