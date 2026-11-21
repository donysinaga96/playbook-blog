import { describe, expect, it } from 'vitest'
import { isReservedFirstSegment, permalinkFirstToken, slugCandidate, slugify, SLUG_MAX, SLUG_PATTERN } from './slug'

describe('slug', () => {
  it.each([
    ['Saksang khas Batak: daging berbumbu!', 'saksang-khas-batak-daging-berbumbu'],
    ['  Résumé  café ', 'resume-cafe'],
    ['Teh & kopi', 'teh-dan-kopi'],
    ['---', ''],
    ['Ponsel 5G 2026', 'ponsel-5g-2026'],
  ])('slugify(%j) = %j', (input, expected) => {
    expect(slugify(input)).toBe(expected)
  })

  it('hasil slugify selalu cocok dengan pola database dan tidak lebih dari 200 karakter', () => {
    const long = slugify('kata '.repeat(100))
    expect(long.length).toBeLessThanOrEqual(SLUG_MAX)
    expect(long).toMatch(SLUG_PATTERN)
  })

  it('kandidat unik tetap dalam batas panjang', () => {
    expect(slugCandidate('resep', 1)).toBe('resep')
    expect(slugCandidate('resep', 3)).toBe('resep-3')
    expect(slugCandidate('a'.repeat(200), 12)).toHaveLength(200)
    expect(slugCandidate('a'.repeat(200), 12)).toMatch(/-12$/)
  })

  it('segmen cadangan dan token permalink', () => {
    expect(isReservedFirstSegment('admin')).toBe(true)
    expect(isReservedFirstSegment('category')).toBe(true)
    expect(isReservedFirstSegment('resep')).toBe(false)
    expect(permalinkFirstToken('/:category/:slug')).toBe(':category')
    expect(permalinkFirstToken('/:yyyy/:mm/:slug')).toBe(':yyyy')
  })
})
