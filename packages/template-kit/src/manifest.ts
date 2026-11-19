// Manifest template (ADR-005): satu paket = satu defineTemplate().
//
//   export default defineTemplate({
//     key: 'magazine', version: '1.0.0', name: 'Magazine', extends: base,
//     tokens: { defaults: { color: { primary: '#0f62fe' } } },
//   })
//
// Template dengan `extends` mewarisi semua yang tidak ia definisikan sendiri:
// skema token/opsi, default (digabung per key), lokasi menu, slot iklan,
// layout, dan view. Template tanpa `extends` (base) wajib lengkap.
//
// Semua dicek saat defineTemplate dipanggil, yaitu saat modul di-import,
// jadi manifest yang salah langsung gagal di test dan build.
//
// Belum didukung (ditambahkan saat dibutuhkan): sections dan defaultLayouts
// (M3), migrateConfig (M3), override komponen (pengecualian, wajib ADR).
import type { Component } from 'vue'
import { z } from 'zod'
import { isPlainObject, mergeDeep } from './objects'
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

export interface TemplateInput {
  /** Huruf kecil, angka, tanda hubung; dipakai di site_themes.template_key dan kelas root .tpl-<key>. */
  key: string
  /** Semver, mis. 1.0.0. */
  version: string
  name: string
  extends?: TemplateDefinition
  tokens?: ConfigInput
  options?: ConfigInput
  menuLocations?: string[]
  adSlots?: string[]
  layout?: ComponentLoader
  views?: Partial<Record<ViewName, ComponentLoader>>
}

export interface ConfigSpec {
  schema: ConfigSchema
  defaults: Record<string, unknown>
}

/** Hasil defineTemplate: sudah lengkap, warisan sudah diterapkan. */
export interface TemplateDefinition {
  readonly key: string
  readonly version: string
  readonly name: string
  /** Rantai pewarisan, dari template ini ke akar: ['magazine', 'base']. */
  readonly lineage: readonly string[]
  readonly tokens: ConfigSpec
  readonly options: ConfigSpec
  readonly menuLocations: readonly string[]
  readonly adSlots: readonly string[]
  readonly layout: ComponentLoader
  readonly views: Readonly<Record<ViewName, ComponentLoader>>
}

export class TemplateDefinitionError extends Error {
  override name = 'TemplateDefinitionError'
}

const TEMPLATE_KEY = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

export function defineTemplate(input: TemplateInput): TemplateDefinition {
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

  const layout = input.layout ?? parent?.layout ?? fail('layout wajib untuk template tanpa extends')
  const views = { ...parent?.views, ...input.views }
  const missing = VIEW_NAMES.filter((name) => !views[name])
  if (missing.length > 0) fail(`view belum ada: ${missing.join(', ')}`)

  return Object.freeze({
    key: input.key,
    version: input.version,
    name: input.name,
    lineage: Object.freeze([input.key, ...(parent?.lineage ?? [])]),
    tokens,
    options,
    menuLocations: Object.freeze([...(input.menuLocations ?? parent?.menuLocations ?? [])]),
    adSlots: Object.freeze([...(input.adSlots ?? parent?.adSlots ?? [])]),
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
