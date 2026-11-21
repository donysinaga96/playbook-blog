// State dan akses API admin di browser (SPA, ADR-009). Data datang dari
// /api/admin/*; kode app/ tidak pernah memanggil repository (hanya tipe
// dari @framework/core yang di-import).
import type { AdminSite, AdminUser, FieldIssue } from '@framework/core'

/** Bentuk data setelah lewat JSON: Date menjadi string ISO. */
export type Json<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Json<U>[]
    : T extends object
      ? { [K in keyof T]: Json<T[K]> }
      : T

export interface AdminMe {
  user: AdminUser
  sites: AdminSite[]
  mode: 'multi' | 'single' | null
}

export function useAdminMe() {
  return useState<AdminMe | null>('admin-me', () => null)
}

/** Muat user dan site sekali; tanpa sesi -> halaman login. */
export async function ensureAdminMe(): Promise<AdminMe | null> {
  const me = useAdminMe()
  if (me.value) return me.value
  try {
    me.value = await $fetch<AdminMe>('/api/admin/me')
    return me.value
  } catch (e) {
    if (apiStatus(e) === 401) await navigateTo('/admin/login')
    throw e
  }
}

/** Site aktif dari parameter route :site (kode site); null bila tidak dikenal. */
export function useAdminSite() {
  const route = useRoute()
  const me = useAdminMe()
  return computed(() => me.value?.sites.find((s) => s.code === route.params['site']) ?? null)
}

/**
 * $fetch ke /api/admin/sites/:siteId/<path>. 401 (sesi habis atau dicabut)
 * dari panggilan mana pun -> kembali ke halaman login.
 */
export async function adminApi<T>(siteId: string, path: string, options: Parameters<typeof $fetch>[1] = {}): Promise<T> {
  try {
    return (await $fetch<T>(`/api/admin/sites/${siteId}/${path.replace(/^\//, '')}`, options as never)) as T
  } catch (e) {
    if (apiStatus(e) === 401) {
      useAdminMe().value = null
      await navigateTo('/admin/login')
    }
    throw e
  }
}

interface ApiErrorShape {
  statusCode?: number
  statusMessage?: string
  data?: { statusMessage?: string; message?: string; data?: { kind?: string; issues?: FieldIssue[] } }
}

export function apiStatus(error: unknown): number | undefined {
  return (error as ApiErrorShape)?.statusCode
}

/** Pesan error dari respons API (statusMessage h3) untuk ditampilkan. */
export function apiErrorMessage(error: unknown, fallback = 'Terjadi kesalahan. Coba lagi.'): string {
  const e = error as ApiErrorShape
  return e?.data?.statusMessage ?? e?.data?.message ?? e?.statusMessage ?? fallback
}

/** Galat per field dari respons 422 (EditorError invalid): { 'slug': 'pesan', ... }. */
export function apiFieldErrors(error: unknown): Record<string, string> {
  const issues = (error as ApiErrorShape)?.data?.data?.issues ?? []
  const out: Record<string, string> = {}
  for (const issue of issues) out[issue.field] ??= issue.message
  return out
}

/** Galat field: cocok persis atau awalan (mis. 'body.blocks.2.text' untuk 'body'). */
export function fieldError(errors: Record<string, string>, field: string): string | null {
  if (errors[field]) return errors[field] ?? null
  const key = Object.keys(errors).find((k) => k.startsWith(`${field}.`))
  return key ? (errors[key] ?? null) : null
}

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draf',
  REVIEW: 'Perlu ditinjau',
  PUBLISHED: 'Terbit',
  ARCHIVED: 'Arsip',
  ACTIVE: 'Tampil',
  HIDDEN: 'Disembunyikan',
}

/** Status tampilan: PUBLISHED dengan tanggal di masa depan = terjadwal. */
export function displayStatus(status: string, publishedAt: string | null): { key: string; label: string } {
  if (status === 'PUBLISHED' && publishedAt && new Date(publishedAt) > new Date()) return { key: 'scheduled', label: 'Terjadwal' }
  return { key: status.toLowerCase(), label: STATUS_LABELS[status] ?? status }
}

/** Tanggal untuk daftar, di zona waktu site. */
export function formatSiteDate(iso: string | null, site: Pick<AdminSite, 'timezone' | 'defaultLocale'>): string {
  if (!iso) return '-'
  return new Intl.DateTimeFormat(site.defaultLocale, { timeZone: site.timezone, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}
