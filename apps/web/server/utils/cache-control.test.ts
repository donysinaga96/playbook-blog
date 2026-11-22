import { describe, expect, it } from 'vitest'
import { publicCacheControl } from './cache-control'

describe('publicCacheControl', () => {
  it('halaman 200 tanpa sesi: cache bersama selama TTL, browser selalu meminta ulang', () => {
    expect(publicCacheControl(200, false, 60)).toBe('public, max-age=0, s-maxage=60')
  })
  it('status selain 200 tidak disimpan (artikel terjadwal yang masih 404)', () => {
    expect(publicCacheControl(404, false, 60)).toBe('no-store')
    expect(publicCacheControl(500, false, 60)).toBe('no-store')
  })
  it('cookie sesi admin: private, no-store', () => {
    expect(publicCacheControl(200, true, 60)).toBe('private, no-store')
  })
  it('TTL 0 mematikan cache', () => {
    expect(publicCacheControl(200, false, 0)).toBe('no-store')
  })
})
