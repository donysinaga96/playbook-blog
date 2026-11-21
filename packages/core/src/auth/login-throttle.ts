// Pembatas percobaan login di memori proses (ADR-009): 5 percobaan gagal per
// IP + email dan 30 per IP dalam 15 menit, lalu ditolak sampai jendela
// waktunya lewat. Cukup untuk satu proses; banyak proses butuh penyimpanan
// bersama.
//
// Percobaan dicatat di begin(), SEBELUM verifikasi password (yang async),
// agar request paralel tidak lolos semua karena hitungannya belum naik.
// Login berhasil mengembalikan catatan itu lewat success(). IP tidak
// diketahui (null) hanya dibatasi per email, agar tidak semua klien berbagi
// satu ember.

export interface ThrottleOptions {
  windowMs?: number
  maxPerKey?: number
  maxPerIp?: number
  /** Batas jumlah entri agar memori tidak tumbuh tanpa batas. */
  maxEntries?: number
  now?: () => number
}

interface Entry {
  count: number
  resetAt: number
}

export function createLoginThrottle(options: ThrottleOptions = {}) {
  const windowMs = options.windowMs ?? 15 * 60_000
  const maxPerKey = options.maxPerKey ?? 5
  const maxPerIp = options.maxPerIp ?? 30
  const maxEntries = options.maxEntries ?? 10_000
  const now = options.now ?? Date.now
  const entries = new Map<string, Entry>()

  const keyOf = (ip: string, email: string) => `k:${ip}|${email.trim().toLowerCase()}`
  const ipOf = (ip: string) => `i:${ip}`

  function current(key: string): Entry | undefined {
    const entry = entries.get(key)
    if (entry && entry.resetAt <= now()) {
      entries.delete(key)
      return undefined
    }
    return entry
  }

  function bump(key: string) {
    const entry = current(key)
    if (entry) {
      entry.count++
      return
    }
    if (entries.size >= maxEntries) {
      // Buang entri kedaluwarsa dulu; bila masih penuh, entri tertua.
      for (const [k, e] of entries) if (e.resetAt <= now()) entries.delete(k)
      if (entries.size >= maxEntries) entries.delete(entries.keys().next().value as string)
    }
    entries.set(key, { count: 1, resetAt: now() + windowMs })
  }

  function retryAfter(ip: string | null, email: string): number {
    const blocking: [Entry | undefined, number][] = [[current(keyOf(ip ?? '-', email)), maxPerKey]]
    if (ip !== null) blocking.push([current(ipOf(ip)), maxPerIp])
    let wait = 0
    for (const [entry, max] of blocking) {
      if (entry && entry.count >= max) wait = Math.max(wait, Math.ceil((entry.resetAt - now()) / 1000))
    }
    return wait
  }

  return {
    retryAfter,
    /**
     * Mulai satu percobaan: detik tunggu bila diblokir (tidak dicatat), atau
     * 0 dan percobaan langsung dicatat sebagai gagal sampai success().
     */
    begin(ip: string | null, email: string): number {
      const wait = retryAfter(ip, email)
      if (wait > 0) return wait
      bump(keyOf(ip ?? '-', email))
      if (ip !== null) bump(ipOf(ip))
      return 0
    },
    /** Login berhasil: hitungan email dihapus dan catatan IP percobaan ini dikembalikan. */
    success(ip: string | null, email: string) {
      entries.delete(keyOf(ip ?? '-', email))
      if (ip === null) return
      const entry = current(ipOf(ip))
      if (entry && entry.count > 0) entry.count--
    },
  }
}

export type LoginThrottle = ReturnType<typeof createLoginThrottle>
