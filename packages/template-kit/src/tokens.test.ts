import { describe, expect, it } from 'vitest'
import { renderTokenCss, TokenError, tokensToCssVars } from './tokens'

describe('tokensToCssVars', () => {
  it('meratakan token bersarang dan mengubah camelCase ke kebab-case', () => {
    expect(tokensToCssVars({ color: { primary: '#0f62fe', textMuted: '#555555' }, radius: { card: '8px' }, lineHeight: 1.6 })).toEqual({
      '--color-primary': '#0f62fe',
      '--color-text-muted': '#555555',
      '--radius-card': '8px',
      '--line-height': '1.6',
    })
  })

  it('nama font ditulis dengan tanda kutip', () => {
    expect(tokensToCssVars({ font: { heading: 'Source Sans 3', body: 'Inter' } })).toEqual({
      '--font-heading': '"Source Sans 3"',
      '--font-body': '"Inter"',
    })
  })

  it('mengizinkan fungsi CSS biasa', () => {
    expect(tokensToCssVars({ space: { gutter: 'clamp(1rem, 2vw + 0.5rem, 2rem)' } })['--space-gutter']).toBe('clamp(1rem, 2vw + 0.5rem, 2rem)')
  })

  it.each([
    ['menutup deklarasi', { color: { primary: 'red;} body{display:none' } }],
    ['menutup tag style', { color: { primary: '</style><script>' } }],
    ['url eksternal', { color: { primary: 'url(//evil.example/x.png)' } }],
    ['kutip di nama font', { font: { body: 'Inter", serif' } }],
    ['baris baru', { color: { primary: '#fff\n}' } }],
    ['key aneh', { 'color-primary': '#fff' }],
    ['angka tak terbatas', { scale: Number.POSITIVE_INFINITY }],
    ['boolean', { dense: true } as never],
    ['null', { color: { primary: null } } as never],
  ])('menolak nilai berbahaya: %s', (_label, tokens) => {
    expect(() => tokensToCssVars(tokens)).toThrow(TokenError)
  })
})

describe('renderTokenCss', () => {
  it('variabel dibatasi ke kelas root template', () => {
    expect(renderTokenCss('magazine', { color: { primary: '#0f62fe' }, font: { body: 'Inter' } })).toBe(
      '.tpl-magazine{--color-primary:#0f62fe;--font-body:"Inter"}',
    )
  })
})
