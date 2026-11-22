// Header cache respons publik (M5 5.4, usulan M5-D, bagian aplikasi).
//
//  - Halaman publik 200 tanpa cookie sesi admin: `public, max-age=0,
//    s-maxage=<TTL>`. Browser selalu meminta ulang; cache bersama (reverse
//    proxy/CDN, M5 deploy) boleh menyimpan selama TTL. TTL inilah batas
//    keterlambatan artikel terjadwal dan artikel yang baru di-approve.
//  - Status lain (404, 500, ...): no-store, agar artikel terjadwal yang masih
//    404 tidak tersimpan di cache.
//  - Request dengan cookie sesi admin (mode single: admin di domain site):
//    private, no-store.
//  - Feed (sitemap, RSS, robots) memakai TTL yang sama.
// Kunci cache di proxy wajib memuat Host (URL lengkap); itu urusan konfigurasi
// proxy saat deploy (usulan M5-D), dan proxy harus melewati cache untuk
// request yang membawa cookie sesi admin.
//
// PUBLIC_CACHE_TTL (detik, bawaan 60, 0..3600); 0 = no-store untuk semua.
import type { RequestEvent } from 'nuxt/server'

export const NO_STORE = 'no-store'
const SESSION_COOKIE = /(?:^|;\s*)blog_admin=/

let ttl: number | undefined

export function publicCacheTtl(): number {
  if (ttl === undefined) {
    const raw = process.env['PUBLIC_CACHE_TTL']?.trim()
    const parsed = raw ? Number(raw) : 60
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 3600) {
      throw new Error(`PUBLIC_CACHE_TTL harus bilangan bulat 0..3600 detik (sekarang: ${raw})`)
    }
    ttl = parsed
  }
  return ttl
}

/** Nilai Cache-Control untuk respons publik; murni, mudah diuji. */
export function publicCacheControl(status: number, hasSessionCookie: boolean, seconds: number): string {
  if (hasSessionCookie) return 'private, no-store'
  if (status !== 200 || seconds === 0) return NO_STORE
  return `public, max-age=0, s-maxage=${seconds}`
}

export function hasAdminSession(event: RequestEvent): boolean {
  return SESSION_COOKIE.test(event.req.headers.get('cookie') ?? '')
}

export function setPublicCache(event: RequestEvent, status: number) {
  event.res.headers.set('cache-control', publicCacheControl(status, hasAdminSession(event), publicCacheTtl()))
}
