import base from '@framework/template-base'
import { createTemplateRegistry, VIEW_NAMES } from '@framework/template-kit'
import { describe, expect, it } from 'vitest'
import news from './index'
import newsManifest from './manifest'

describe('template news', () => {
  it('manifest 1.0.0, semua view, layout, dan section dari base (tanpa override)', () => {
    expect(news).toMatchObject({ key: 'news', version: '1.0.0', lineage: ['news', 'base'] })
    for (const name of VIEW_NAMES) expect(news.views[name]).toBe(base.views[name])
    expect(news.layout).toBe(base.layout)
    expect(news.sections).toBe(base.sections)
    expect(news.tokens).toBe(newsManifest.tokens)
  })

  it('token, opsi, dan layout home bawaan sendiri di atas base', () => {
    expect(news.tokens.defaults).toEqual({
      color: { primary: '#b3261e', surface: '#fffbf5', text: '#1d1b16' },
      font: { heading: 'Merriweather', body: 'Source Sans 3' },
      radius: { card: '2px' },
    })
    expect(news.options.defaults).toEqual({ header: { style: 'left', showDate: true } })
    expect(news.defaultLayouts.home.map((s) => s.type)).toEqual(['headline-list', 'latest-grid'])
    expect(news.defaultLayouts.home).not.toEqual(base.defaultLayouts.home)
  })

  it('config dari seed (dapur-nusantara) lolos tanpa issue', () => {
    const registry = createTemplateRegistry([base, news], { fallback: 'base' })
    const theme = registry.resolveTheme({
      templateKey: 'news',
      templateVersion: '1.0.0',
      tokens: { color: { primary: '#b3261e', surface: '#fffbf5', text: '#1d1b16' }, font: { heading: 'Merriweather', body: 'Source Sans 3' }, radius: { card: '2px' } },
      options: { header: { style: 'left', showDate: false } },
      layouts: { home: [{ type: 'headline-list', props: { source: 'latest', limit: 5 } }, { type: 'category-strip', props: { categorySlug: 'resep', limit: 8 } }] },
    })
    expect(theme.rootClass).toBe('tpl-news')
    expect(theme.css).toBe('.tpl-news{--color-primary:#b3261e;--color-surface:#fffbf5;--color-text:#1d1b16;--font-heading:"Merriweather";--font-body:"Source Sans 3";--radius-card:2px}')
    expect(theme.layouts.home.map((s) => s.type)).toEqual(['headline-list', 'category-strip'])
    expect(theme.issues).toEqual([])
  })
})
