// Repository user admin terhadap database dev yang di-seed (dilewati tanpa
// DATABASE_URL). User test dibuat dan dihapus di sini; user seed tidak diubah.
// File test lain membuat site sementara secara paralel, jadi daftar site
// superadmin hanya dibandingkan untuk site seed.
import { createDatabase, eq, users } from '@framework/db'
import { afterAll, describe, expect, it } from 'vitest'
import { createRepositories, UserInputError } from './index'

describe.skipIf(!process.env['DATABASE_URL'])('repository user admin', () => {
  const db = createDatabase({ connectionString: process.env['DATABASE_URL'] ?? '', max: 2, applicationName: 'vitest-users' })
  const repos = createRepositories(db)
  const email = `test-${process.pid}-${Date.now()}@local.test`
  afterAll(async () => {
    await db.delete(users).where(eq(users.email, email))
    await db.$client.end()
  })

  it('superadmin seed: semua site ACTIVE; mode single hanya SITE_CODE', async () => {
    const admin = await repos.users.findForLogin('Admin@Local.Test ')
    if (!admin) throw new Error('admin seed tidak ada')
    expect(admin).toMatchObject({ email: 'admin@local.test', isSuperadmin: true })
    const seed = <T extends { code: string }>(list: T[]) => list.filter((s) => ['dapur-nusantara', 'kabar-tekno'].includes(s.code))
    expect(seed(await repos.users.listSites(admin, { mode: 'multi' })).map((s) => [s.code, s.role])).toEqual([
      ['dapur-nusantara', 'OWNER'],
      ['kabar-tekno', 'OWNER'],
    ])
    expect((await repos.users.listSites(admin, { mode: 'single', siteCode: 'kabar-tekno' })).map((s) => s.code)).toEqual(['kabar-tekno'])
  })

  it('anggota biasa: hanya site keanggotaannya', async () => {
    const author = await repos.users.findForLogin('penulis@local.test')
    if (!author) throw new Error('penulis seed tidak ada')
    expect((await repos.users.listSites(author, { mode: 'multi' })).map((s) => [s.code, s.role])).toEqual([['kabar-tekno', 'AUTHOR']])
    expect(await repos.users.listSites(author, { mode: 'single', siteCode: 'dapur-nusantara' })).toEqual([])
  })

  it('createAdmin + OWNER dalam satu transaksi; email ganda dan site tak dikenal ditolak', async () => {
    const created = await repos.users.createAdmin({ email: email.toUpperCase(), displayName: ' Admin Test ', passwordHash: 'hash-palsu', isSuperadmin: false, siteCodes: ['dapur-nusantara'] })
    expect(created).toMatchObject({ email, displayName: 'Admin Test', isSuperadmin: false })
    expect((await repos.users.listSites(created, { mode: 'multi' })).map((s) => [s.code, s.role])).toEqual([['dapur-nusantara', 'OWNER']])
    await expect(repos.users.createAdmin({ email, displayName: 'X', passwordHash: 'h', isSuperadmin: false, siteCodes: [] })).rejects.toThrow(UserInputError)
    await expect(repos.users.createAdmin({ email: `lain-${email}`, displayName: 'X', passwordHash: 'h', isSuperadmin: false, siteCodes: ['tidak-ada'] })).rejects.toThrow(/site tidak ditemukan: tidak-ada/)
    expect(await repos.users.findForLogin(`lain-${email}`)).toBeNull()
  })

  it('getActive, setPassword, dan user DISABLED tidak bisa login', async () => {
    const user = await repos.users.findForLogin(email)
    if (!user) throw new Error('user test tidak ada')
    expect(await repos.users.getActive(user.id)).toMatchObject({ email })
    expect(await repos.users.getActive('bukan-uuid')).toBeNull()
    expect(await repos.users.setPassword(email, 'hash-baru')).toBe(true)
    expect(await repos.users.setPassword('tidak-ada@local.test', 'x')).toBe(false)
    expect((await repos.users.findForLogin(email))?.passwordHash).toBe('hash-baru')

    await db.update(users).set({ status: 'DISABLED' }).where(eq(users.email, email))
    expect((await repos.users.findForLogin(email))?.passwordHash).toBeNull()
    expect(await repos.users.getActive(user.id)).toBeNull()
  })
})
