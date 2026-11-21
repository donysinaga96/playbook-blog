import base from '@framework/template-base'
import { createTemplateRegistry, VIEW_NAMES } from '@framework/template-kit'
import { describe, expect, it } from 'vitest'
import magazine from './index'

describe('template magazine', () => {
  it('mewarisi semua view dan layout dari base (tanpa override)', () => {
    expect(magazine).toMatchObject({ key: 'magazine', lineage: ['magazine', 'base'] })
    for (const name of VIEW_NAMES) expect(magazine.views[name]).toBe(base.views[name])
    expect(magazine.layout).toBe(base.layout)
  })

  it('token dan opsi sendiri di atas skema base', () => {
    expect(magazine.tokens.schema).toBe(base.tokens.schema)
    expect(magazine.tokens.defaults).toEqual({
      color: { primary: '#0f62fe', surface: '#ffffff', text: '#161616' },
      font: { heading: 'Inter', body: 'Inter' },
      radius: { card: '8px' },
    })
    expect(magazine.options.defaults).toEqual({ header: { style: 'centered', showDate: true } })
  })

  it('1.1.0: slot iklan di manifest, bukan di options', () => {
    expect(magazine.version).toBe('1.1.0')
    expect(magazine.adSlots).toEqual(['header_banner'])
    expect(magazine.options.schema.shape).not.toHaveProperty('adSlots')
  })

  it('config 1.0.0 dari seed (kabar-tekno) dimigrasi: options.adSlots dibuang, tanpa issue', () => {
    const registry = createTemplateRegistry([base, magazine], { fallback: 'base' })
    const options = { header: { style: 'centered', showDate: true }, adSlots: { header_banner: null } }
    const theme = registry.resolveTheme({
      templateKey: 'magazine',
      templateVersion: '1.0.0',
      tokens: { color: { primary: '#0f62fe', surface: '#ffffff', text: '#161616' }, font: { heading: 'Inter', body: 'Inter' }, radius: { card: '8px' } },
      options,
    })
    expect(theme).toMatchObject({ templateKey: 'magazine', templateVersion: '1.1.0', rootClass: 'tpl-magazine', options: { header: { style: 'centered', showDate: true } } })
    expect(theme.css).toBe('.tpl-magazine{--color-primary:#0f62fe;--color-surface:#ffffff;--color-text:#161616;--font-heading:"Inter";--font-body:"Inter";--radius-card:8px}')
    expect(theme.issues).toEqual([])
    // Config tersimpan tidak diubah (baris database tidak ditulis ulang).
    expect(options.adSlots).toEqual({ header_banner: null })
  })

  it('config 1.1.0 yang masih membawa adSlots tetap dicatat (migrasi hanya untuk versi lama)', () => {
    const registry = createTemplateRegistry([base, magazine], { fallback: 'base' })
    const theme = registry.resolveTheme({ templateKey: 'magazine', templateVersion: '1.1.0', tokens: {}, options: { adSlots: {} } })
    expect(theme.issues).toEqual(['options.adSlots: key tidak dikenal, diabaikan'])
  })
})
