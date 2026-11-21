import { describe, expect, it } from 'vitest'
import { createLoginThrottle } from './login-throttle'

function setup(overrides = {}) {
  let time = 0
  const throttle = createLoginThrottle({ now: () => time, ...overrides })
  return { throttle, advance: (ms: number) => { time += ms } }
}

describe('createLoginThrottle', () => {
  it('5 kegagalan per IP + email -> ditolak sampai jendela 15 menit lewat', () => {
    const { throttle, advance } = setup()
    for (let i = 0; i < 4; i++) throttle.begin('1.1.1.1', 'a@x.test')
    expect(throttle.retryAfter('1.1.1.1', 'a@x.test')).toBe(0)
    throttle.begin('1.1.1.1', 'A@x.test ')
    expect(throttle.retryAfter('1.1.1.1', 'a@x.test')).toBe(900)
    // Email lain dari IP yang sama dan IP lain untuk email yang sama tetap boleh.
    expect(throttle.retryAfter('1.1.1.1', 'b@x.test')).toBe(0)
    expect(throttle.retryAfter('2.2.2.2', 'a@x.test')).toBe(0)
    advance(15 * 60_000)
    expect(throttle.retryAfter('1.1.1.1', 'a@x.test')).toBe(0)
  })

  it('30 kegagalan per IP (email berganti-ganti) -> IP ditolak', () => {
    const { throttle } = setup()
    for (let i = 0; i < 30; i++) throttle.begin('3.3.3.3', `user${i}@x.test`)
    expect(throttle.retryAfter('3.3.3.3', 'baru@x.test')).toBeGreaterThan(0)
  })

  it('percobaan paralel: dicatat saat dimulai, jadi yang ke-6 ditolak sebelum verifikasi selesai', () => {
    const { throttle } = setup()
    const started = Array.from({ length: 8 }, () => throttle.begin('1.1.1.1', 'a@x.test'))
    expect(started.filter((w) => w === 0)).toHaveLength(5)
    expect(started.slice(5).every((w) => w > 0)).toBe(true)
  })

  it('IP tidak diketahui: hanya dibatasi per email, tidak berbagi ember IP', () => {
    const { throttle } = setup()
    for (let i = 0; i < 40; i++) throttle.begin(null, `u${i}@x.test`)
    expect(throttle.retryAfter(null, 'baru@x.test')).toBe(0)
    for (let i = 0; i < 5; i++) throttle.begin(null, 'z@x.test')
    expect(throttle.retryAfter(null, 'z@x.test')).toBeGreaterThan(0)
  })

  it('login berhasil menghapus hitungan IP + email', () => {
    const { throttle } = setup()
    for (let i = 0; i < 4; i++) throttle.begin('1.1.1.1', 'a@x.test')
    throttle.success('1.1.1.1', 'a@x.test')
    throttle.begin('1.1.1.1', 'a@x.test')
    expect(throttle.retryAfter('1.1.1.1', 'a@x.test')).toBe(0)
  })

  it('jumlah entri dibatasi', () => {
    const { throttle } = setup({ maxEntries: 10 })
    for (let i = 0; i < 100; i++) throttle.begin(`10.0.0.${i}`, 'a@x.test')
    // Tidak melempar dan tetap bekerja untuk kunci baru.
    for (let i = 0; i < 5; i++) throttle.begin('9.9.9.9', 'z@x.test')
    expect(throttle.retryAfter('9.9.9.9', 'z@x.test')).toBeGreaterThan(0)
  })
})
