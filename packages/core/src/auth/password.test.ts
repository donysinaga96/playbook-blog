import { describe, expect, it } from 'vitest'
import { hashPassword, passwordProblem, verifyPassword } from './password'

describe('password admin (Argon2id)', () => {
  it('hash Argon2id dengan salt acak; verifikasi benar dan salah', async () => {
    const a = await hashPassword('kata-sandi-panjang-1')
    const b = await hashPassword('kata-sandi-panjang-1')
    expect(a).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
    expect(a).not.toBe(b)
    expect(await verifyPassword(a, 'kata-sandi-panjang-1')).toBe(true)
    expect(await verifyPassword(a, 'kata-sandi-panjang-2')).toBe(false)
  })

  it('tanpa hash (user tidak ada) dan hash rusak -> false, bukan error', async () => {
    expect(await verifyPassword(null, 'password-palsu-untuk-waktu')).toBe(false)
    expect(await verifyPassword('bukan-hash', 'apa saja yang panjang')).toBe(false)
  })

  it.each([
    ['pendek', 'a'.repeat(11), /minimal 12/],
    ['terlalu panjang', 'a'.repeat(257), /maksimal 256/],
    ['spasi di tepi', ' kata-sandi-panjang ', /spasi/],
  ])('menolak password %s', async (_label, password, message) => {
    expect(passwordProblem(password)).toMatch(message)
    await expect(hashPassword(password)).rejects.toThrow(message)
  })
})
