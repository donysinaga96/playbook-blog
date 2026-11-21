import { describe, expect, it } from 'vitest'
import { compareVersions, migrateConfig, migrationProblems, type ConfigMigration, type StoredConfig } from './migrations'

const stored = (version: string, options: unknown = {}): StoredConfig & { version: string } => ({ version, tokens: {}, options, layouts: {} })
/** Migrasi yang mencatat dirinya di options.steps. */
const mark = (step: string): ConfigMigration => (cfg) => {
  const options = cfg.options as { steps?: string[] }
  return { ...cfg, options: { ...options, steps: [...(options.steps ?? []), step] } }
}

describe('compareVersions', () => {
  it.each([
    ['1.0.0', '1.0.0', 0],
    ['1.0.9', '1.1.0', -1],
    ['1.10.0', '1.9.0', 1],
    ['2.0.0', '10.0.0', -1],
  ])('%s vs %s', (a, b, sign) => {
    expect(Math.sign(compareVersions(a, b))).toBe(sign)
  })
})

describe('migrateConfig', () => {
  const migrations = { '2.0.0': mark('2.0.0'), '1.1.0': mark('1.1.0'), '1.2.0': mark('1.2.0') }

  it('menjalankan migrasi di antara versi tersimpan dan terpasang, urut naik', () => {
    const result = migrateConfig(stored('1.0.0'), '2.0.0', migrations)
    expect(result).toMatchObject({ ok: true, applied: ['1.1.0', '1.2.0', '2.0.0'], config: { options: { steps: ['1.1.0', '1.2.0', '2.0.0'] } } })
  })

  it('versi tersimpan tanpa kunci sendiri (patch) tetap tertangani', () => {
    expect(migrateConfig(stored('1.1.3'), '1.2.0', migrations)).toMatchObject({ ok: true, applied: ['1.2.0'] })
  })

  it('versi sama -> tanpa migrasi, config apa adanya', () => {
    expect(migrateConfig(stored('2.0.0', { a: 1 }), '2.0.0', migrations)).toEqual({ ok: true, applied: [], config: { tokens: {}, options: { a: 1 }, layouts: {} } })
  })

  it('config asli tidak diubah walau migrasi mengubah argumennya', () => {
    const input = stored('1.0.0', { adSlots: { x: 1 } })
    const mutate: ConfigMigration = (cfg) => {
      delete (cfg.options as Record<string, unknown>)['adSlots']
      return cfg
    }
    expect(migrateConfig(input, '1.1.0', { '1.1.0': mutate })).toMatchObject({ ok: true, config: { options: {} } })
    expect(input.options).toEqual({ adSlots: { x: 1 } })
  })

  it.each([
    ['versi tersimpan lebih baru', stored('3.0.0'), /lebih baru dari versi terpasang 2\.0\.0/],
    ['versi tersimpan bukan semver', stored('1.0'), /bukan semver/],
  ])('gagal: %s', (_label, input, reason) => {
    const result = migrateConfig(input, '2.0.0', migrations)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(reason)
  })

  it('migrasi yang melempar error atau mengembalikan bukan object -> gagal dengan nama langkahnya', () => {
    const boom: ConfigMigration = () => {
      throw new Error('rusak')
    }
    expect(migrateConfig(stored('1.0.0'), '1.1.0', { '1.1.0': boom })).toEqual({ ok: false, reason: 'migrateConfig 1.1.0 gagal: rusak' })
    for (const bad of [null, [], { options: {} }]) {
      expect(migrateConfig(stored('1.0.0'), '1.1.0', { '1.1.0': () => bad as unknown as StoredConfig })).toEqual({
        ok: false,
        reason: 'migrateConfig 1.1.0 gagal: hasil harus object berisi tokens, options, dan layouts',
      })
    }
  })
})

describe('migrateConfig: versi mayor dan bentuk versi', () => {
  it('setiap mayor yang dilewati wajib punya langkah X.0.0, termasuk 0.x -> 1.0.0', () => {
    expect(migrateConfig(stored('0.9.0'), '1.1.0', { '1.1.0': mark('1.1.0') })).toEqual({ ok: false, reason: 'config versi 0.9.0 butuh migrateConfig "1.0.0" yang tidak ada' })
    expect(migrateConfig(stored('0.9.0'), '1.1.0', { '1.0.0': mark('1.0.0'), '1.1.0': mark('1.1.0') })).toMatchObject({ ok: true, applied: ['1.0.0', '1.1.0'] })
  })

  it('angka berawalan nol diterima seperti CHECK database (1.01.0 = 1.1.0)', () => {
    expect(compareVersions('1.01.0', '1.1.0')).toBe(0)
    expect(migrateConfig(stored('1.01.0'), '1.2.0', { '1.1.0': mark('1.1.0'), '1.2.0': mark('1.2.0') })).toMatchObject({ ok: true, applied: ['1.2.0'] })
  })

  it('config yang tidak bisa disalin -> gagal, bukan exception', () => {
    const input = { ...stored('1.0.0'), options: { fn: () => 1 } }
    expect(migrateConfig(input, '1.1.0', {})).toMatchObject({ ok: false, reason: expect.stringMatching(/^config tidak bisa disalin/) })
  })
})

describe('migrationProblems', () => {
  it('versi mayor wajib punya migrasi ke X.0.0', () => {
    expect(migrationProblems('1.4.0', {})).toEqual([])
    expect(migrationProblems('3.1.0', { '2.0.0': mark('2') })).toEqual(['versi mayor 3 wajib punya migrateConfig "3.0.0"'])
  })

  it('kunci harus semver dan tidak lebih baru dari versi template', () => {
    expect(migrationProblems('1.1.0', { 'v1.1': mark('x'), '1.2.0': mark('y') })).toEqual([
      'migrateConfig "v1.1" bukan semver',
      'migrateConfig "1.2.0" lebih baru dari versi template 1.1.0',
    ])
  })
})
