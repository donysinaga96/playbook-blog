// Registry template dan pemuatan theme aktif sebuah site.
//
// Alur (dokumen desain, "Alur saat satu halaman dirender"):
//  1. Baris aktif site_themes dicari template-nya di registry berdasarkan
//     template_key. Tidak ditemukan -> template fallback (base), dicatat
//     sebagai issue, bukan crash.
//  1b. Config yang disimpan untuk versi lebih lama dimigrasi dulu
//     (migrateConfig, migrations.ts). Migrasi gagal atau versi tersimpan
//     lebih baru -> config diabaikan (default), dicatat.
//  2. tokens dan options divalidasi skema manifest PER KEY: nilai yang tidak
//     valid jatuh ke default, key yang tidak dikenal dibuang. Satu warna
//     yang salah tidak merusak seluruh theme.
//  3. Token dijadikan CSS variable di bawah kelas root .tpl-<key>.
//  4. layouts divalidasi per halaman (resolveLayout, ADR-008): section yang
//     rusak dilewati, layout kosong atau rusak -> defaultLayouts manifest.
//
// Registry cukup berisi manifest (entry ./manifest), jadi bisa dipakai di
// server sebelum view model dibangun (ADR-008). Renderer Vue mendaftarkan
// definisi lengkap (manifest + komponen) dan memakai get() untuk komponen.
//
// Hasilnya (ResolvedTheme) hanya berisi data JSON, jadi bisa dikirim dari
// server ke browser; komponen diambil lagi dari registry lewat templateKey.
import { z } from 'zod'
import type { ConfigSchema, ConfigSpec, TemplateManifest } from './manifest'
import { migrateConfig } from './migrations'
import { isPlainObject } from './objects'
import { LAYOUT_PAGES, resolveLayout, type ResolvedLayouts } from './sections'
import { renderTokenCss, templateRootClass, type TokenTree } from './tokens'

/** Bentuk baris site_themes yang dibutuhkan registry. */
export interface StoredTheme {
  templateKey: string
  templateVersion: string
  tokens: unknown
  options: unknown
  /** Susunan section per jenis halaman; boleh tidak ada (= defaultLayouts). */
  layouts?: unknown
}

export interface ResolvedTheme {
  /** Template yang benar-benar dipakai (bisa fallback). */
  templateKey: string
  templateVersion: string
  /** Kelas root halaman: .tpl-<templateKey>. */
  rootClass: string
  tokens: Record<string, unknown>
  options: Record<string, unknown>
  /** Section per jenis halaman, sudah divalidasi; permintaan datanya dijalankan core. */
  layouts: ResolvedLayouts
  /** Satu aturan CSS berisi variabel token, untuk <style> di <head>. */
  css: string
  /** Hal yang perlu dicatat ke log: fallback template, nilai tidak valid. Kosong bila bersih. */
  issues: string[]
}

export interface ConfigResult {
  value: Record<string, unknown>
  issues: string[]
}

/**
 * Validasi config per key terhadap skema object. Object bersarang divalidasi
 * rekursif; nilai lain (leaf) dipakai bila lolos skemanya, bila tidak memakai
 * default. Key yang tidak ada di skema dibuang.
 */
export function resolveConfig(spec: ConfigSpec, raw: unknown, label = 'config'): ConfigResult {
  const issues: string[] = []

  function walk(schema: ConfigSchema, defaults: Record<string, unknown>, input: unknown, path: string[]) {
    const out: Record<string, unknown> = {}
    const source = isPlainObject(input) ? input : {}
    if (input !== undefined && input !== null && !isPlainObject(input)) {
      issues.push(`${label}.${path.join('.') || '(akar)'}: bukan object, memakai default`)
    }
    for (const [key, sub] of Object.entries(schema.shape)) {
      const fallback = defaults[key]
      const value = source[key]
      const here = [...path, key]
      if (sub instanceof z.ZodObject) {
        out[key] = walk(sub, isPlainObject(fallback) ? fallback : {}, value, here)
        continue
      }
      if (value === undefined) {
        out[key] = fallback
        continue
      }
      const parsed = (sub as z.ZodType).safeParse(value)
      if (parsed.success) {
        out[key] = parsed.data
      } else {
        out[key] = fallback
        issues.push(`${label}.${here.join('.')}: nilai ${JSON.stringify(value)} tidak valid, memakai default`)
      }
    }
    for (const key of Object.keys(source)) {
      if (!(key in schema.shape)) issues.push(`${label}.${[...path, key].join('.')}: key tidak dikenal, diabaikan`)
    }
    return out
  }

  const value = walk(spec.schema, spec.defaults, raw, [])
  // Skema bisa punya aturan lintas key (refine); bila gagal, pakai default utuh.
  const whole = spec.schema.safeParse(value)
  if (!whole.success) {
    issues.push(`${label}: kombinasi nilai tidak valid, memakai default`)
    return { value: spec.defaults, issues }
  }
  return { value: whole.data as Record<string, unknown>, issues }
}

export interface TemplateRegistry<T extends TemplateManifest = TemplateManifest> {
  /** Template terdaftar, urut sesuai pendaftaran. */
  readonly templates: readonly T[]
  readonly fallback: T
  /** Template berdasarkan key; fallback bila tidak terdaftar. */
  get(key: string): T
  has(key: string): boolean
  /** Theme aktif site -> template + config tervalidasi. Null (site tanpa theme) -> fallback dengan default. */
  resolveTheme(stored: StoredTheme | null): ResolvedTheme
}

export function createTemplateRegistry<T extends TemplateManifest>(templates: T[], options: { fallback: string }): TemplateRegistry<T> {
  const byKey = new Map<string, T>()
  for (const template of templates) {
    if (byKey.has(template.key)) throw new Error(`template "${template.key}" didaftarkan dua kali`)
    byKey.set(template.key, template)
  }
  const fallback = byKey.get(options.fallback)
  if (!fallback) throw new Error(`template fallback "${options.fallback}" tidak terdaftar`)

  return {
    templates: Object.freeze([...templates]),
    fallback,
    has: (key) => byKey.has(key),
    get: (key) => byKey.get(key) ?? fallback,

    resolveTheme(stored) {
      const issues: string[] = []
      let template = fallback
      // Config mentah yang divalidasi; null = pakai default template.
      let config: { tokens: unknown; options: unknown; layouts: unknown } | null = stored
        ? { tokens: stored.tokens, options: stored.options, layouts: stored.layouts }
        : null
      if (stored) {
        const found = byKey.get(stored.templateKey)
        if (found) {
          template = found
          const migrated = migrateConfig(
            { tokens: stored.tokens, options: stored.options, layouts: stored.layouts, version: stored.templateVersion },
            found.version,
            found.migrateConfig,
          )
          if (migrated.ok) {
            config = migrated.config
          } else {
            issues.push(`${found.key}: ${migrated.reason}; memakai default`)
            config = null
          }
        } else {
          issues.push(`template "${stored.templateKey}" tidak terdaftar, memakai ${fallback.key}`)
        }
      }

      const tokens = resolveConfig(template.tokens, config?.tokens, 'tokens')
      const opts = resolveConfig(template.options, config?.options, 'options')
      issues.push(...tokens.issues, ...opts.issues)

      const storedLayouts = config?.layouts
      if (storedLayouts !== undefined && storedLayouts !== null && !isPlainObject(storedLayouts)) {
        issues.push('layouts: bukan object, memakai default')
      }
      const layoutSource = isPlainObject(storedLayouts) ? storedLayouts : {}
      const layouts = {} as ResolvedLayouts
      for (const page of LAYOUT_PAGES) {
        const resolved = resolveLayout({
          sections: template.sections,
          raw: layoutSource[page],
          fallback: template.defaultLayouts[page],
          label: `layouts.${page}`,
        })
        layouts[page] = resolved.sections
        issues.push(...resolved.issues)
      }

      let css: string
      try {
        css = renderTokenCss(template.key, tokens.value as TokenTree)
      } catch (error) {
        issues.push(`tokens: ${error instanceof Error ? error.message : String(error)}; memakai default`)
        tokens.value = template.tokens.defaults
        css = renderTokenCss(template.key, template.tokens.defaults as TokenTree)
      }

      return {
        templateKey: template.key,
        templateVersion: template.version,
        rootClass: templateRootClass(template.key),
        tokens: tokens.value,
        options: opts.value,
        layouts,
        css,
        issues,
      }
    },
  }
}
