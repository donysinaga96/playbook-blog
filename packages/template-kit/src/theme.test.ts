import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineTemplate, type ComponentLoader, type ConfigSpec } from './manifest'
import { createTemplateRegistry, resolveConfig } from './theme'
import { VIEW_NAMES, type ViewName } from './view-models'

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
  const loader: ComponentLoader = async () => ({ default: {} })
  const views = Object.fromEntries(VIEW_NAMES.map((v) => [v, loader])) as Record<ViewName, ComponentLoader>
  const base = defineTemplate({ key: 'base', version: '1.0.0', name: 'Base', tokens: spec, options: { schema: z.object({ showDate: z.boolean() }), defaults: { showDate: false } }, layout: loader, views })
  const magazine = defineTemplate({ key: 'magazine', version: '1.2.0', name: 'Magazine', extends: base, tokens: { defaults: { color: { primary: '#0f62fe' } } } })
  const registry = createTemplateRegistry([base, magazine], { fallback: 'base' })

  it('theme tersimpan -> template, config tervalidasi, dan CSS', () => {
    const theme = registry.resolveTheme({ templateKey: 'magazine', templateVersion: '1.0.0', tokens: { radius: { card: '8px' } }, options: { showDate: true } })
    expect(theme).toEqual({
      templateKey: 'magazine',
      templateVersion: '1.2.0',
      rootClass: 'tpl-magazine',
      tokens: { color: { primary: '#0f62fe', surface: '#ffffff' }, radius: { card: '8px' }, scale: 1 },
      options: { showDate: true },
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

  it('beda versi mayor dicatat (migrateConfig belum ada)', () => {
    expect(registry.resolveTheme({ templateKey: 'magazine', templateVersion: '0.9.0', tokens: {}, options: {} }).issues).toEqual([
      'config disimpan untuk magazine@0.9.0, template terpasang 1.2.0; migrateConfig belum didukung',
    ])
  })

  it('hasil bisa dikirim sebagai JSON tanpa kehilangan data', () => {
    const theme = registry.resolveTheme({ templateKey: 'magazine', templateVersion: '1.0.0', tokens: {}, options: {} })
    expect(JSON.parse(JSON.stringify(theme))).toEqual(theme)
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
