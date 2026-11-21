import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineManifest, type ConfigSpec } from './manifest'
import { defineSection } from './sections'
import { createTemplateRegistry, resolveConfig } from './theme'

const hex = z.string().regex(/^#[0-9a-f]{6}$/i)
const spec: ConfigSpec = {
  schema: z.object({
    color: z.object({ primary: hex, surface: hex }),
    radius: z.object({ card: z.enum(['0px', '8px']) }),
    scale: z.number().min(0.5).max(2),
  }),
  defaults: { color: { primary: '#000000', surface: '#ffffff' }, radius: { card: '0px' }, scale: 1 },
}

describe('resolveConfig', () => {
  it('nilai valid dipakai, sisanya default', () => {
    expect(resolveConfig(spec, { color: { primary: '#0f62fe' } })).toEqual({
      value: { color: { primary: '#0f62fe', surface: '#ffffff' }, radius: { card: '0px' }, scale: 1 },
      issues: [],
    })
  })

  it('nilai tidak valid jatuh ke default per key, bukan seluruh config', () => {
    const { value, issues } = resolveConfig(spec, { color: { primary: 'merah', surface: '#fafafa' }, radius: { card: '99px' }, scale: 1.25 }, 'tokens')
    expect(value).toEqual({ color: { primary: '#000000', surface: '#fafafa' }, radius: { card: '0px' }, scale: 1.25 })
    expect(issues).toEqual([
      'tokens.color.primary: nilai "merah" tidak valid, memakai default',
      'tokens.radius.card: nilai "99px" tidak valid, memakai default',
    ])
  })

  it('key tidak dikenal dibuang dan dicatat', () => {
    const { value, issues } = resolveConfig(spec, { color: { accent: '#ff0000' }, extra: 1 }, 'tokens')
    expect(value).not.toHaveProperty('extra')
    expect(value['color']).not.toHaveProperty('accent')
    expect(issues).toEqual(['tokens.color.accent: key tidak dikenal, diabaikan', 'tokens.extra: key tidak dikenal, diabaikan'])
  })

  it.each([null, undefined, {}])('config kosong (%j) -> default tanpa issue', (raw) => {
    expect(resolveConfig(spec, raw)).toEqual({ value: spec.defaults, issues: [] })
  })

  it('bentuk salah (bukan object) -> default dan dicatat', () => {
    const { value, issues } = resolveConfig(spec, { color: 'biru' }, 'tokens')
    expect(value['color']).toEqual({ primary: '#000000', surface: '#ffffff' })
    expect(issues).toEqual(['tokens.color: bukan object, memakai default'])
  })

  it('aturan lintas key yang gagal -> default utuh', () => {
    const refined: ConfigSpec = {
      schema: z.object({ min: z.number(), max: z.number() }).refine((v) => v.min <= v.max),
      defaults: { min: 1, max: 2 },
    }
    expect(resolveConfig(refined, { min: 5, max: 3 })).toEqual({ value: { min: 1, max: 2 }, issues: ['config: kombinasi nilai tidak valid, memakai default'] })
  })
})

describe('createTemplateRegistry', () => {
  const sections = {
    grid: defineSection({ props: z.object({ limit: z.number().int().min(1).max(12).default(6) }), data: ({ limit }) => ({ source: 'latest', limit }) }),
  }
  const base = defineManifest({
    key: 'base',
    version: '1.0.0',
    name: 'Base',
    tokens: spec,
    options: { schema: z.object({ showDate: z.boolean() }), defaults: { showDate: false } },
    sections,
    defaultLayouts: { home: [{ type: 'grid' }] },
  })
  const magazine = defineManifest({
    key: 'magazine',
    version: '1.2.0',
    name: 'Magazine',
    extends: base,
    tokens: { defaults: { color: { primary: '#0f62fe' } } },
    defaultLayouts: { home: [{ type: 'grid', props: { limit: 3 } }] },
    migrateConfig: {
      // 1.2.0: color.accent diganti nama menjadi color.primary.
      '1.2.0': (cfg) => {
        const tokens = cfg.tokens as { color?: Record<string, unknown> }
        if (!tokens.color || !('accent' in tokens.color)) return cfg
        const { accent, ...color } = tokens.color
        return { ...cfg, tokens: { ...tokens, color: { ...color, primary: accent } } }
      },
    },
  })
  const grid = (limit: number) => ({ type: 'grid', props: { limit }, articles: { source: 'latest', limit } })
  const registry = createTemplateRegistry([base, magazine], { fallback: 'base' })

  it('theme tersimpan -> template, config tervalidasi, dan CSS', () => {
    const theme = registry.resolveTheme({ templateKey: 'magazine', templateVersion: '1.0.0', tokens: { radius: { card: '8px' } }, options: { showDate: true } })
    expect(theme).toEqual({
      templateKey: 'magazine',
      templateVersion: '1.2.0',
      rootClass: 'tpl-magazine',
      tokens: { color: { primary: '#0f62fe', surface: '#ffffff' }, radius: { card: '8px' }, scale: 1 },
      options: { showDate: true },
      layouts: { home: [grid(3)] },
      css: '.tpl-magazine{--color-primary:#0f62fe;--color-surface:#ffffff;--radius-card:8px;--scale:1}',
      issues: [],
    })
  })

  it('template tidak terdaftar -> fallback base, config tetap dipakai sejauh valid, dicatat', () => {
    const theme = registry.resolveTheme({ templateKey: 'news', templateVersion: '1.0.0', tokens: { color: { primary: '#b3261e' }, font: { heading: 'Merriweather' } }, options: {} })
    expect(theme).toMatchObject({ templateKey: 'base', rootClass: 'tpl-base', tokens: { color: { primary: '#b3261e', surface: '#ffffff' } } })
    expect(theme.issues).toEqual(['template "news" tidak terdaftar, memakai base', 'tokens.font: key tidak dikenal, diabaikan'])
  })

  it('site tanpa theme -> fallback dengan default, tanpa issue', () => {
    expect(registry.resolveTheme(null)).toMatchObject({ templateKey: 'base', tokens: spec.defaults, issues: [] })
  })

  it('config versi lama dimigrasi sebelum validasi (migrateConfig magazine 1.2.0)', () => {
    const theme = registry.resolveTheme({ templateKey: 'magazine', templateVersion: '1.0.0', tokens: { color: { accent: '#ff0000' } }, options: {} })
    expect(theme.tokens['color']).toEqual({ primary: '#ff0000', surface: '#ffffff' })
    expect(theme.issues).toEqual([])
  })

  it('versi tersimpan lebih baru dari terpasang -> default semua, dicatat', () => {
    const theme = registry.resolveTheme({ templateKey: 'magazine', templateVersion: '2.0.0', tokens: { radius: { card: '8px' } }, options: { showDate: true }, layouts: { home: [{ type: 'grid', props: { limit: 1 } }] } })
    expect(theme).toMatchObject({ templateKey: 'magazine', tokens: magazine.tokens.defaults, options: { showDate: false }, layouts: { home: [grid(3)] } })
    expect(theme.issues).toEqual(['magazine: config disimpan untuk versi 2.0.0, lebih baru dari versi terpasang 1.2.0; memakai default'])
  })

  it('hasil bisa dikirim sebagai JSON tanpa kehilangan data', () => {
    const theme = registry.resolveTheme({ templateKey: 'magazine', templateVersion: '1.0.0', tokens: {}, options: {} })
    expect(JSON.parse(JSON.stringify(theme))).toEqual(theme)
  })

  it('layout tersimpan divalidasi; rusak -> defaultLayouts template, dicatat', () => {
    const stored = { templateKey: 'magazine', templateVersion: '1.2.0', tokens: {}, options: {} }
    expect(registry.resolveTheme({ ...stored, layouts: { home: [{ type: 'grid', props: { limit: 5 } }] } })).toMatchObject({ layouts: { home: [grid(5)] }, issues: [] })
    expect(registry.resolveTheme({ ...stored, layouts: { home: [{ type: 'hero' }] } })).toMatchObject({
      layouts: { home: [grid(3)] },
      issues: ['layouts.home[0]: section "hero" tidak dikenal, dilewati', 'layouts.home: tidak ada section yang valid, memakai default'],
    })
    expect(registry.resolveTheme({ ...stored, layouts: 'home' })).toMatchObject({ layouts: { home: [grid(3)] }, issues: ['layouts: bukan object, memakai default'] })
    expect(registry.resolveTheme({ ...stored, layouts: { home: [] } })).toMatchObject({ layouts: { home: [] }, issues: [] })
    expect(registry.resolveTheme({ ...stored, layouts: {} })).toMatchObject({ layouts: { home: [grid(3)] }, issues: [] })
  })

  it('fallback memakai defaultLayouts base, bukan milik template yang tidak terdaftar', () => {
    expect(registry.resolveTheme(null).layouts).toEqual({ home: [grid(6)] })
  })

  it('get: key tidak dikenal -> fallback', () => {
    expect(registry.get('magazine')).toBe(magazine)
    expect(registry.get('tidak-ada')).toBe(base)
    expect(registry.has('tidak-ada')).toBe(false)
  })

  it('menolak pendaftaran ganda dan fallback yang tidak terdaftar', () => {
    expect(() => createTemplateRegistry([base, base], { fallback: 'base' })).toThrow(/dua kali/)
    expect(() => createTemplateRegistry([magazine], { fallback: 'base' })).toThrow(/fallback "base" tidak terdaftar/)
  })
})
