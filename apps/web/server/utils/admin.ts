// Admin (ADR-009): konfigurasi, sesi, dan pemeriksaan akses. Config dibaca
// sekali per proses; sesi dan user selalu per request (event), tidak
// disimpan di modul (ADR-001).
import { createLoginThrottle, normalizeHost, parseAdminConfig, type AdminConfig, type AdminSite, type AdminUser } from '@framework/core'
import { createError, getRequestHost, getRequestIP, getRequestURL, useSession, type RequestEvent } from 'nuxt/server'
import { useRepositories } from './database'
import { useSiteMode } from './site-mode'

let adminConfig: AdminConfig | undefined

/** Melempar AdminConfigError bila env salah; plugin admin memanggilnya saat start. */
export function useAdminConfig(): AdminConfig {
  adminConfig ??= parseAdminConfig(process.env, useSiteMode())
  return adminConfig
}

/** Pembatas login, satu per proses (ADR-009). */
export const loginThrottle = createLoginThrottle()

/**
 * IP klien untuk pembatas login. Tanpa TRUST_PROXY: alamat koneksi. Dengan
 * TRUST_PROXY=true (satu reverse proxy di depan server): entri PALING KANAN
 * X-Forwarded-For, yaitu yang ditambahkan proxy kita. Entri di kirinya bisa
 * diisi klien sesukanya (nginx $proxy_add_x_forwarded_for dan Traefik
 * menambahkan, bukan menimpa). Null bila tidak diketahui.
 */
export function clientIp(event: RequestEvent): string | null {
  if (process.env['TRUST_PROXY'] === 'true') {
    const forwarded = event.req.headers.get('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean)
    const last = forwarded?.at(-1)
    if (last) return last
  }
  return getRequestIP(event) ?? null
}

const ADMIN_PREFIXES = ['/admin', '/api/admin']

/**
 * Pathname dalam bentuk yang dicocokkan router: router men-decode percent-
 * encoding sebelum mencocokkan route, jadi /api/%61dmin/login sampai ke
 * handler /api/admin/login. Pemeriksaan path harus memakai bentuk yang sama
 * (temuan security review 21 Nov 2026). Encoding rusak -> pathname apa adanya.
 */
export function routedPath(pathname: string): string {
  try {
    return decodeURI(pathname)
  } catch {
    return pathname
  }
}

/** Path admin: /admin, /admin/..., /api/admin/... (bukan /administrasi). Menerima pathname mentah. */
export function isAdminPath(pathname: string): boolean {
  const path = routedPath(pathname)
  return ADMIN_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Pemeriksaan yang juga dijalankan middleware, diulang di handler (lapisan
 * kedua): mode multi hanya di ADMIN_HOST; method non-GET wajib Origin yang
 * sama dengan origin request. Selisih normalisasi path antara middleware dan
 * router tidak bisa melewatinya.
 */
export function assertAdminRequest(event: RequestEvent): void {
  const config = useAdminConfig()
  if (!config.enabled) throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  if (config.mode === 'multi' && normalizeHost(getRequestHost(event)) !== config.host) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }
  if (!SAFE_METHODS.has(event.req.method)) {
    const origin = event.req.headers.get('origin')
    if (!origin || origin !== getRequestURL(event, { xForwardedProto: true }).origin) {
      throw createError({ statusCode: 403, statusMessage: 'Origin tidak diizinkan' })
    }
  }
}

const SESSION_NAME = 'blog_admin'
const SESSION_MAX_AGE = 8 * 60 * 60

type AdminSessionData = {
  userId?: string
}

/** Sesi cookie terenkripsi; Secure bila request HTTPS (langsung atau lewat proxy). */
export async function useAdminSession(event: RequestEvent) {
  assertAdminRequest(event)
  const config = useAdminConfig()
  if (!config.enabled) throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  const secure = getRequestURL(event, { xForwardedProto: true }).protocol === 'https:'
  return useSession<AdminSessionData>(event, {
    name: SESSION_NAME,
    password: config.sessionSecret,
    maxAge: SESSION_MAX_AGE,
    cookie: { secure, sameSite: 'lax', httpOnly: true, path: '/' },
  })
}

export interface AdminContext {
  user: AdminUser
  sites: AdminSite[]
}

/** User login yang masih ACTIVE + site yang boleh dikelolanya; 401 bila tidak. */
export async function requireAdmin(event: RequestEvent): Promise<AdminContext> {
  const session = await useAdminSession(event)
  const userId = session.data.userId
  const user = userId ? await useRepositories().users.getActive(userId) : null
  if (!user) {
    if (userId) await session.clear()
    throw createError({ statusCode: 401, statusMessage: 'Belum login' })
  }
  const sites = await useRepositories().users.listSites(user, useSiteMode())
  // Sama dengan aturan login: user tanpa site tidak punya apa pun untuk dikelola.
  if (sites.length === 0) {
    await session.clear()
    throw createError({ statusCode: 401, statusMessage: 'Belum login' })
  }
  return { user, sites }
}

/** Site yang diminta harus milik user; selain itu 404 agar keberadaannya tidak terbaca. */
export function requireSite(admin: AdminContext, siteId: string | undefined): AdminSite {
  const site = admin.sites.find((s) => s.id === siteId)
  if (!site) throw createError({ statusCode: 404, statusMessage: 'Site tidak ditemukan' })
  return site
}
