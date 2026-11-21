// Konfigurasi admin dari environment (ADR-009), dibaca sekali saat start.
//
//   ADMIN_SESSION_SECRET  wajib agar admin aktif; minimal 32 karakter
//   ADMIN_HOST            mode multi: host khusus admin, mis. admin.localhost
//
// Tanpa secret, admin nonaktif (semua path admin 404). Nilai yang diisi
// tetapi salah ditolak, agar proses gagal start alih-alih berjalan dengan
// admin yang tidak bisa dipakai.
import type { SiteMode } from '../site/mode'
import { normalizeHost } from '../repositories/site-repository'

export type AdminConfig =
  | { enabled: false; reason: string }
  | { enabled: true; mode: 'multi'; host: string; sessionSecret: string }
  | { enabled: true; mode: 'single'; siteCode: string; sessionSecret: string }

export class AdminConfigError extends Error {
  override name = 'AdminConfigError'
}

export const SESSION_SECRET_MIN = 32

export function parseAdminConfig(env: Record<string, string | undefined>, siteMode: SiteMode): AdminConfig {
  const secret = env['ADMIN_SESSION_SECRET']?.trim() || undefined
  const rawHost = env['ADMIN_HOST']?.trim() || undefined
  if (!secret) return { enabled: false, reason: 'ADMIN_SESSION_SECRET belum diisi' }
  if (secret.length < SESSION_SECRET_MIN) {
    throw new AdminConfigError(`Konfigurasi admin tidak valid -> ADMIN_SESSION_SECRET minimal ${SESSION_SECRET_MIN} karakter`)
  }

  if (siteMode.mode === 'single') {
    if (rawHost) throw new AdminConfigError('Konfigurasi admin tidak valid -> ADMIN_HOST tidak dipakai saat SITE_MODE=single (admin ada di domain site)')
    return { enabled: true, mode: 'single', siteCode: siteMode.siteCode, sessionSecret: secret }
  }
  if (!rawHost) throw new AdminConfigError('Konfigurasi admin tidak valid -> ADMIN_HOST wajib diisi saat SITE_MODE=multi, mis. admin.localhost')
  const host = normalizeHost(rawHost)
  if (!host || rawHost.includes('/')) throw new AdminConfigError(`Konfigurasi admin tidak valid -> ADMIN_HOST "${rawHost}" bukan hostname`)
  return { enabled: true, mode: 'multi', host, sessionSecret: secret }
}
