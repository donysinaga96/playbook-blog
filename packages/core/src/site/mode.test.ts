import { describe, expect, it } from 'vitest'
import { parseSiteMode, SiteModeConfigError } from './mode'

describe('parseSiteMode', () => {
  it('multi tanpa SITE_CODE', () => {
    expect(parseSiteMode({ SITE_MODE: 'multi' })).toEqual({ mode: 'multi' })
  })

  it('single dengan SITE_CODE; spasi di ujung diabaikan', () => {
    expect(parseSiteMode({ SITE_MODE: 'single', SITE_CODE: ' kabar-tekno ' })).toEqual({ mode: 'single', siteCode: 'kabar-tekno' })
  })

  it('SITE_CODE kosong di mode multi dianggap tidak diisi', () => {
    expect(parseSiteMode({ SITE_MODE: 'multi', SITE_CODE: '' })).toEqual({ mode: 'multi' })
  })

  it.each([
    ['SITE_MODE tidak diisi', {}, /SITE_MODE wajib diisi/],
    ['SITE_MODE kosong', { SITE_MODE: '' }, /SITE_MODE wajib diisi/],
    ['SITE_MODE tidak dikenal', { SITE_MODE: 'both' }, /SITE_MODE wajib diisi/],
    ['SITE_MODE huruf besar', { SITE_MODE: 'MULTI' }, /SITE_MODE wajib diisi/],
    ['single tanpa SITE_CODE', { SITE_MODE: 'single' }, /SITE_CODE/],
    ['single dengan SITE_CODE berformat salah', { SITE_MODE: 'single', SITE_CODE: 'Kabar Tekno' }, /SITE_CODE: harus huruf kecil/],
    ['single dengan SITE_CODE terlalu panjang', { SITE_MODE: 'single', SITE_CODE: 'a'.repeat(51) }, /SITE_CODE/],
    ['multi dengan SITE_CODE (ambigu)', { SITE_MODE: 'multi', SITE_CODE: 'kabar-tekno' }, /SITE_CODE: tidak boleh diisi/],
  ])('menolak: %s', (_label, env, message) => {
    expect(() => parseSiteMode(env)).toThrow(SiteModeConfigError)
    expect(() => parseSiteMode(env)).toThrow(message)
  })
})
