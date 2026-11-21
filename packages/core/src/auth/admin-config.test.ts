import { describe, expect, it } from 'vitest'
import { AdminConfigError, parseAdminConfig } from './admin-config'

const secret = 'x'.repeat(32)
const multi = { mode: 'multi' } as const
const single = { mode: 'single', siteCode: 'kabar-tekno' } as const

describe('parseAdminConfig', () => {
  it('tanpa secret -> admin nonaktif, bukan error', () => {
    expect(parseAdminConfig({ ADMIN_HOST: 'admin.localhost' }, multi)).toEqual({ enabled: false, reason: 'ADMIN_SESSION_SECRET belum diisi' })
    expect(parseAdminConfig({ ADMIN_SESSION_SECRET: '  ' }, single).enabled).toBe(false)
  })

  it('multi: host dinormalisasi (huruf kecil, tanpa port)', () => {
    expect(parseAdminConfig({ ADMIN_SESSION_SECRET: secret, ADMIN_HOST: 'Admin.Localhost:3000' }, multi)).toEqual({
      enabled: true, mode: 'multi', host: 'admin.localhost', sessionSecret: secret,
    })
  })

  it('single: admin di domain site SITE_CODE', () => {
    expect(parseAdminConfig({ ADMIN_SESSION_SECRET: secret }, single)).toEqual({ enabled: true, mode: 'single', siteCode: 'kabar-tekno', sessionSecret: secret })
  })

  it.each([
    ['secret pendek', { ADMIN_SESSION_SECRET: 'pendek', ADMIN_HOST: 'admin.localhost' }, multi, /minimal 32/],
    ['multi tanpa host', { ADMIN_SESSION_SECRET: secret }, multi, /ADMIN_HOST wajib/],
    ['host bukan hostname', { ADMIN_SESSION_SECRET: secret, ADMIN_HOST: 'http://admin.localhost/x' }, multi, /bukan hostname/],
    ['single dengan host', { ADMIN_SESSION_SECRET: secret, ADMIN_HOST: 'admin.localhost' }, single, /tidak dipakai saat SITE_MODE=single/],
  ] as const)('menolak: %s', (_label, env, mode, message) => {
    expect(() => parseAdminConfig(env, mode)).toThrow(AdminConfigError)
    expect(() => parseAdminConfig(env, mode)).toThrow(message)
  })
})
