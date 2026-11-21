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

describe('pesan validasi form admin', async () => {
  const { z } = await import('zod')
  const { editorErrorMap } = await import('./errors')
  const messages = (schema: import('zod').ZodType, input: unknown) =>
    schema.safeParse(input, { error: editorErrorMap }).error?.issues.map((i) => i.message) ?? []

  it('kalimat biasa untuk kasus umum, bahasa Indonesia untuk sisanya', () => {
    expect(messages(z.string().trim().min(1), '  ')).toEqual(['Wajib diisi'])
    expect(messages(z.string().max(5), 'panjang sekali')).toEqual(['Maksimal 5 karakter'])
    expect(messages(z.uuid(), '')).toEqual(['Wajib dipilih'])
    expect(messages(z.uuid(), 'x')).toEqual(['UUID tidak valid'])
    expect(messages(z.array(z.string()).min(1), [])).toEqual(['Isi minimal satu butir'])
  })
})
