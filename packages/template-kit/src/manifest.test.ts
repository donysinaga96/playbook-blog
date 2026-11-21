import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  defineManifest,
  defineTemplate,
  TemplateDefinitionError,
  type ComponentLoader,
  type ManifestInput,
} from './manifest'
import { defineSection } from './sections'
import { VIEW_NAMES, type ViewName } from './view-models'

// Komponen palsu: definisi hanya menyimpan loader, tidak memanggilnya.
const loader = (name: string): ComponentLoader => async () => ({ default: { name } })
const allViews = Object.fromEntries(VIEW_NAMES.map((v) => [v, loader(v)])) as Record<ViewName, ComponentLoader>

const sections = {
  grid: defineSection({
    props: z.object({ limit: z.number().int().min(1).max(12).default(6) }),
    data: ({ limit }) => ({ source: 'latest', limit }),
  }),
}

const baseInput: ManifestInput = {
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
  sections,
  defaultLayouts: { home: [{ type: 'grid', props: { limit: 9 } }] },
}

describe('defineManifest', () => {
  const base = defineManifest(baseInput)

  it('manifest dasar lengkap, tanpa komponen', () => {
    expect(base).toMatchObject({ key: 'base', version: '1.0.0', lineage: ['base'], menuLocations: ['header', 'footer'], adSlots: [] })
    expect(Object.keys(base.sections)).toEqual(['grid'])
    expect(base.defaultLayouts.home).toEqual([{ type: 'grid', props: { limit: 9 } }])
    expect(base).not.toHaveProperty('views')
    expect(Object.isFrozen(base)).toBe(true)
  })

  it('extends: mewarisi skema, section, dan defaultLayouts; default digabung per key', () => {
    const magazine = defineManifest({
      key: 'magazine',
      version: '1.0.0',
      name: 'Magazine',
      extends: base,
      tokens: { defaults: { color: { primary: '#0f62fe' } } },
      options: { defaults: { header: { style: 'centered' } } },
    })
    expect(magazine.lineage).toEqual(['magazine', 'base'])
    expect(magazine.tokens.schema).toBe(base.tokens.schema)
    expect(magazine.tokens.defaults).toEqual({ color: { primary: '#0f62fe', text: '#111111' }, font: { body: 'Inter' } })
    expect(magazine.options.defaults).toEqual({ header: { style: 'centered', showDate: false } })
    expect(magazine.sections).toEqual(base.sections)
    expect(magazine.defaultLayouts.home).toEqual(base.defaultLayouts.home)
    expect(magazine.menuLocations).toEqual(['header', 'footer'])
  })

  it('turunan boleh mengganti defaultLayouts', () => {
    const news = defineManifest({ key: 'news', version: '1.0.0', name: 'News', extends: base, defaultLayouts: { home: [{ type: 'grid' }] } })
    expect(news.defaultLayouts.home).toEqual([{ type: 'grid' }])
  })

  it('default dari input tidak diubah', () => {
    const defaults = { color: { primary: '#0f62fe' } }
    defineManifest({ key: 'x', version: '1.0.0', name: 'X', extends: base, tokens: { defaults } })
    expect(defaults).toEqual({ color: { primary: '#0f62fe' } })
  })

  it.each<[string, Partial<ManifestInput>, RegExp]>([
    ['key huruf besar', { key: 'Magazine' }, /key harus/],
    ['key diawali angka', { key: '1mag' }, /key harus/],
    ['version bukan semver', { version: '1.0' }, /bukan semver/],
    ['name kosong', { name: ' ' }, /name wajib/],
    ['tanpa skema tokens', { tokens: { defaults: {} } }, /tokens.schema wajib/],
    ['default tidak lolos skema', { tokens: { ...baseInput.tokens!, defaults: { color: { primary: 'merah', text: '#111111' }, font: { body: 'Inter' } } } }, /tokens.defaults tidak lolos skema -> color.primary/],
    ['default token tidak bisa jadi CSS', { tokens: { schema: z.object({ color: z.object({ primary: z.string() }) }), defaults: { color: { primary: 'red;}' } } } }, /CSS variable/],
    ['defaultLayouts memakai section tidak dikenal', { defaultLayouts: { home: [{ type: 'carousel' }] } }, /section "carousel" tidak dikenal/],
    ['defaultLayouts dengan props salah', { defaultLayouts: { home: [{ type: 'grid', props: { limit: 99 } }] } }, /props section "grid" tidak valid/],
  ])('menolak: %s', (_label, patch, message) => {
    expect(() => defineManifest({ ...baseInput, ...patch })).toThrow(TemplateDefinitionError)
    expect(() => defineManifest({ ...baseInput, ...patch })).toThrow(message)
  })

  it('menolak key yang sama dengan induk', () => {
    expect(() => defineManifest({ key: 'base', version: '2.0.0', name: 'Base 2', extends: base })).toThrow(/sama dengan induknya/)
  })

  it('menolak default turunan yang melanggar skema induk', () => {
    expect(() => defineManifest({ key: 'x', version: '1.0.0', name: 'X', extends: base, tokens: { defaults: { font: { body: 'Comic Sans' } } } })).toThrow(/font.body/)
  })

  it('migrateConfig: tidak diwariskan; versi mayor tanpa migrasi X.0.0 ditolak', () => {
    const v1 = defineManifest({ key: 'mag', version: '1.1.0', name: 'Mag', extends: base, migrateConfig: { '1.1.0': (cfg) => cfg } })
    expect(Object.keys(v1.migrateConfig)).toEqual(['1.1.0'])
    expect(defineManifest({ key: 'child', version: '1.0.0', name: 'C', extends: v1 }).migrateConfig).toEqual({})
    expect(() => defineManifest({ key: 'mag', version: '2.0.0', name: 'Mag', extends: base })).toThrow(/versi mayor 2 wajib punya migrateConfig "2.0.0"/)
    expect(() => defineManifest({ key: 'mag', version: '1.0.0', name: 'Mag', extends: base, migrateConfig: { '1.1.0': (cfg) => cfg } })).toThrow(/lebih baru dari versi template/)
  })

  it('menolak section di template turunan (komponen section hanya ada di base)', () => {
    expect(() => defineManifest({ key: 'x', version: '1.0.0', name: 'X', extends: base, sections })).toThrow(/sections hanya didefinisikan template base/)
  })
})

describe('defineTemplate', () => {
  const baseManifest = defineManifest(baseInput)
  const base = defineTemplate({ manifest: baseManifest, layout: loader('Layout'), views: allViews })
  const magazineManifest = defineManifest({ key: 'magazine', version: '1.0.0', name: 'Magazine', extends: baseManifest })

  it('manifest + komponen', () => {
    expect(base).toMatchObject({ key: 'base', version: '1.0.0', lineage: ['base'] })
    expect(base.tokens).toBe(baseManifest.tokens)
    expect(base.sections).toBe(baseManifest.sections)
    expect(Object.keys(base.views).sort()).toEqual([...VIEW_NAMES].sort())
    expect(Object.isFrozen(base)).toBe(true)
  })

  it('extends: mewarisi layout dan view, boleh mengganti sebagian view', () => {
    const home = loader('MagazineHome')
    const magazine = defineTemplate({ manifest: magazineManifest, extends: base, views: { home } })
    expect(magazine.views.home).toBe(home)
    expect(magazine.views.article).toBe(base.views.article)
    expect(magazine.layout).toBe(base.layout)
  })

  it.each<[string, () => unknown, RegExp]>([
    ['tanpa layout', () => defineTemplate({ manifest: baseManifest, views: allViews }), /layout wajib/],
    ['view kurang', () => defineTemplate({ manifest: baseManifest, layout: loader('L'), views: { home: loader('Home') } }), /view belum ada: article/],
    ['extends tidak sesuai induk manifest', () => defineTemplate({ manifest: magazineManifest }), /extends \(tidak ada\) harus sama dengan induk manifest \(base\)/],
    ['extends pada manifest tanpa induk', () => defineTemplate({ manifest: baseManifest, extends: base }), /extends \(base\) harus sama dengan induk manifest \(tidak ada\)/],
  ])('menolak: %s', (_label, make, message) => {
    expect(make).toThrow(TemplateDefinitionError)
    expect(make).toThrow(message)
  })
})
