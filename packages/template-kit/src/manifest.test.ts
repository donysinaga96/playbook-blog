import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineTemplate, TemplateDefinitionError, type ComponentLoader, type TemplateInput } from './manifest'
import { VIEW_NAMES, type ViewName } from './view-models'

// Komponen palsu: manifest hanya menyimpan loader, tidak memanggilnya.
const loader = (name: string): ComponentLoader => async () => ({ default: { name } })
const allViews = Object.fromEntries(VIEW_NAMES.map((v) => [v, loader(v)])) as Record<ViewName, ComponentLoader>

const baseInput: TemplateInput = {
  key: 'base',
  version: '1.0.0',
  name: 'Base',
  tokens: {
    schema: z.object({
      color: z.object({ primary: z.string().regex(/^#[0-9a-f]{6}$/i), text: z.string().regex(/^#[0-9a-f]{6}$/i) }),
      font: z.object({ body: z.enum(['Inter', 'Merriweather']) }),
    }),
    defaults: { color: { primary: '#333333', text: '#111111' }, font: { body: 'Inter' } },
  },
  options: {
    schema: z.object({ header: z.object({ style: z.enum(['left', 'centered']), showDate: z.boolean() }) }),
    defaults: { header: { style: 'left', showDate: false } },
  },
  menuLocations: ['header', 'footer'],
  layout: loader('Layout'),
  views: allViews,
}

describe('defineTemplate', () => {
  const base = defineTemplate(baseInput)

  it('template dasar lengkap', () => {
    expect(base).toMatchObject({ key: 'base', version: '1.0.0', lineage: ['base'], menuLocations: ['header', 'footer'], adSlots: [] })
    expect(Object.keys(base.views).sort()).toEqual([...VIEW_NAMES].sort())
    expect(Object.isFrozen(base)).toBe(true)
  })

  it('extends: mewarisi skema, view, layout; default digabung per key', () => {
    const home = loader('MagazineHome')
    const magazine = defineTemplate({
      key: 'magazine',
      version: '1.0.0',
      name: 'Magazine',
      extends: base,
      tokens: { defaults: { color: { primary: '#0f62fe' } } },
      options: { defaults: { header: { style: 'centered' } } },
      views: { home },
    })
    expect(magazine.lineage).toEqual(['magazine', 'base'])
    expect(magazine.tokens.schema).toBe(base.tokens.schema)
    expect(magazine.tokens.defaults).toEqual({ color: { primary: '#0f62fe', text: '#111111' }, font: { body: 'Inter' } })
    expect(magazine.options.defaults).toEqual({ header: { style: 'centered', showDate: false } })
    expect(magazine.views.home).toBe(home)
    expect(magazine.views.article).toBe(base.views.article)
    expect(magazine.layout).toBe(base.layout)
    expect(magazine.menuLocations).toEqual(['header', 'footer'])
  })

  it('default dari input tidak diubah', () => {
    const defaults = { color: { primary: '#0f62fe' } }
    defineTemplate({ key: 'x', version: '1.0.0', name: 'X', extends: base, tokens: { defaults } })
    expect(defaults).toEqual({ color: { primary: '#0f62fe' } })
  })

  it.each<[string, Partial<TemplateInput>, RegExp]>([
    ['key huruf besar', { key: 'Magazine' }, /key harus/],
    ['key diawali angka', { key: '1mag' }, /key harus/],
    ['version bukan semver', { version: '1.0' }, /bukan semver/],
    ['name kosong', { name: ' ' }, /name wajib/],
    ['tanpa skema tokens', { tokens: { defaults: {} } }, /tokens.schema wajib/],
    ['default tidak lolos skema', { tokens: { ...baseInput.tokens!, defaults: { color: { primary: 'merah', text: '#111111' }, font: { body: 'Inter' } } } }, /tokens.defaults tidak lolos skema -> color.primary/],
    ['default token tidak bisa jadi CSS', { tokens: { schema: z.object({ color: z.object({ primary: z.string() }) }), defaults: { color: { primary: 'red;}' } } } }, /CSS variable/],
    ['tanpa layout', { layout: undefined }, /layout wajib/],
    ['view kurang', { views: { home: loader('Home') } }, /view belum ada: article/],
  ])('menolak: %s', (_label, patch, message) => {
    expect(() => defineTemplate({ ...baseInput, ...patch })).toThrow(TemplateDefinitionError)
    expect(() => defineTemplate({ ...baseInput, ...patch })).toThrow(message)
  })

  it('menolak key yang sama dengan induk', () => {
    expect(() => defineTemplate({ key: 'base', version: '2.0.0', name: 'Base 2', extends: base })).toThrow(/sama dengan induknya/)
  })

  it('menolak default turunan yang melanggar skema induk', () => {
    expect(() => defineTemplate({ key: 'x', version: '1.0.0', name: 'X', extends: base, tokens: { defaults: { font: { body: 'Comic Sans' } } } })).toThrow(/font.body/)
  })
})
