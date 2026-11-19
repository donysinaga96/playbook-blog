import base from '@framework/template-base'
import { createTemplateRegistry, VIEW_NAMES } from '@framework/template-kit'
import { describe, expect, it } from 'vitest'
import magazine from './index'

describe('template magazine', () => {
  it('manifest 1.0.0, mewarisi semua view dan layout dari base (tanpa override)', () => {
    expect(magazine).toMatchObject({ key: 'magazine', version: '1.0.0', lineage: ['magazine', 'base'] })
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

  it('config dari seed (kabar-tekno) lolos tanpa issue', () => {
    const registry = createTemplateRegistry([base, magazine], { fallback: 'base' })
    const theme = registry.resolveTheme({
      templateKey: 'magazine',
      templateVersion: '1.0.0',
      tokens: { color: { primary: '#0f62fe', surface: '#ffffff', text: '#161616' }, font: { heading: 'Inter', body: 'Inter' }, radius: { card: '8px' } },
      options: { header: { style: 'centered', showDate: true }, adSlots: { header_banner: null } },
    })
    expect(theme.rootClass).toBe('tpl-magazine')
    expect(theme.css).toBe('.tpl-magazine{--color-primary:#0f62fe;--color-surface:#ffffff;--color-text:#161616;--font-heading:"Inter";--font-body:"Inter";--radius-card:8px}')
    // adSlots ada di seed tetapi belum menjadi opsi template: dibuang dan dicatat.
    expect(theme.issues).toEqual(['options.adSlots: key tidak dikenal, diabaikan'])
  })
})
