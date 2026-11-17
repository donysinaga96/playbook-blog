import { describe, expect, it } from 'vitest'
import { DEFAULT_PERMALINK, parseSiteSettings, siteSettingsSchema } from './settings'

describe('sites.settings', () => {
  it('object kosong valid dan diisi default', () => {
    expect(parseSiteSettings({})).toEqual({
      permalink: DEFAULT_PERMALINK,
      seo: {},
      social: {},
      analytics: {},
    })
  })

  it('menerima settings kedua site di data seed', () => {
    const tekno = parseSiteSettings({
      tagline: 'Teknologi tanpa jargon',
      permalink: '/:category/:slug',
      seo: { titleTemplate: '%s | Kabar Tekno', defaultDescription: 'Berita dan ulasan teknologi.' },
    })
    expect(tekno.seo.titleTemplate).toBe('%s | Kabar Tekno')

    const dapur = parseSiteSettings({
      tagline: 'Resep rumahan dari seluruh Indonesia',
      permalink: '/:category/:slug',
      seo: { titleTemplate: '%s - Dapur Nusantara', defaultDescription: 'Resep dan cerita kuliner Nusantara.' },
    })
    expect(dapur.tagline).toBe('Resep rumahan dari seluruh Indonesia')
  })

  it.each(['/:slug', '/:category/:slug', '/:year/:month/:slug'])(
    'permalink %s valid',
    (permalink) => {
      expect(siteSettingsSchema.safeParse({ permalink }).success).toBe(true)
    },
  )

  it.each([
    ['tanpa :slug', '/:category'],
    ['tidak diawali /', ':category/:slug'],
    ['protocol-relative //host', '//evil.test/:slug'],
    ['token tidak dikenal', '/:author/:slug'],
    ['teks tetap dicampur token', '/berita-:slug'],
    ['URL penuh', 'https://evil.test/:slug'],
  ])('permalink ditolak: %s', (_label, permalink) => {
    expect(siteSettingsSchema.safeParse({ permalink }).success).toBe(false)
  })

  it('titleTemplate wajib memuat %s', () => {
    expect(siteSettingsSchema.safeParse({ seo: { titleTemplate: 'Kabar Tekno' } }).success).toBe(false)
  })

  it('link sosial hanya https; javascript: dan http ditolak', () => {
    expect(siteSettingsSchema.safeParse({ social: { x: 'https://x.com/kabartekno' } }).success).toBe(true)
    expect(siteSettingsSchema.safeParse({ social: { x: 'javascript:alert(1)' } }).success).toBe(false)
    expect(siteSettingsSchema.safeParse({ social: { x: 'http://x.com/kabartekno' } }).success).toBe(false)
  })

  it('ID Google Analytics harus berformat G-XXXX', () => {
    expect(siteSettingsSchema.safeParse({ analytics: { googleAnalyticsId: 'G-ABC123XYZ' } }).success).toBe(true)
    expect(siteSettingsSchema.safeParse({ analytics: { googleAnalyticsId: 'UA-1234-1' } }).success).toBe(false)
  })

  it('membuang key yang tidak dikenal alih-alih gagal (data lama tetap terbaca)', () => {
    const parsed = parseSiteSettings({ tagline: 'x', fieldLama: 'abc', seo: { warisan: 1 } })
    expect(parsed).not.toHaveProperty('fieldLama')
    expect(parsed.seo).toEqual({})
  })
})
