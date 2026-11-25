import { describe, expect, it } from 'vitest'
import { isCertificateAllowed, type TlsAskDeps } from './tls-ask'

type Resolved = Awaited<ReturnType<TlsAskDeps['sites']['findByDomain']>>

function deps(domains: Record<string, { code: string; isPrimary: boolean; primary: string }>, adminHost: string | null = 'admin.contoh.id', mode: TlsAskDeps['mode'] = { mode: 'multi' } as TlsAskDeps['mode']): TlsAskDeps {
  return {
    mode,
    adminHost,
    sites: {
      async findByDomain(host: string) {
        const d = domains[host]
        if (!d) return null
        return { site: { code: d.code }, isPrimary: d.isPrimary, primaryDomain: d.primary, matchedDomain: host } as unknown as Resolved
      },
    },
  }
}

const known = deps({
  'beritakonoha.id': { code: 'beritakonoha', isPrimary: true, primary: 'beritakonoha.id' },
  'www.beritakonoha.id': { code: 'beritakonoha', isPrimary: false, primary: 'beritakonoha.id' },
})

describe('isCertificateAllowed', () => {
  it('domain primary dan alias site diizinkan', async () => {
    expect(await isCertificateAllowed('beritakonoha.id', known)).toBe(true)
    expect(await isCertificateAllowed('www.beritakonoha.id', known)).toBe(true)
  })
  it('ADMIN_HOST diizinkan', async () => {
    expect(await isCertificateAllowed('admin.contoh.id', known)).toBe(true)
  })
  it('domain tak dikenal, kosong, atau bukan hostname ditolak', async () => {
    expect(await isCertificateAllowed('evil.example', known)).toBe(false)
    expect(await isCertificateAllowed(undefined, known)).toBe(false)
    expect(await isCertificateAllowed('', known)).toBe(false)
    expect(await isCertificateAllowed('beritakonoha.id/x', known)).toBe(false)
    expect(await isCertificateAllowed('beritakonoha.id:8443', known)).toBe(false)
  })
  it('huruf besar dinormalisasi', async () => {
    expect(await isCertificateAllowed('BeritaKonoha.ID', known)).toBe(true)
  })
  it('tanpa admin (adminHost null) host admin tidak otomatis diizinkan', async () => {
    expect(await isCertificateAllowed('admin.contoh.id', deps({}, null))).toBe(false)
  })
  it('mode single: domain milik site lain ditolak', async () => {
    const single = deps({ 'lain.id': { code: 'lain', isPrimary: true, primary: 'lain.id' } }, null, { mode: 'single', siteCode: 'beritakonoha' } as TlsAskDeps['mode'])
    expect(await isCertificateAllowed('lain.id', single)).toBe(false)
  })
})
