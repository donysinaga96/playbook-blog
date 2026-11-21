// State admin di browser (SPA, ADR-009). Data datang dari /api/admin/*;
// kode app/ tidak pernah memanggil repository.
import type { AdminSite, AdminUser } from '@framework/core'

export interface AdminMe {
  user: AdminUser
  sites: AdminSite[]
  mode: 'multi' | 'single' | null
}

export function useAdminMe() {
  return useState<AdminMe | null>('admin-me', () => null)
}

/** Pesan error dari respons API (statusMessage h3) untuk ditampilkan. */
export function apiErrorMessage(error: unknown, fallback = 'Terjadi kesalahan. Coba lagi.'): string {
  const e = error as { statusCode?: number; statusMessage?: string; data?: { statusMessage?: string; message?: string } }
  return e?.data?.statusMessage ?? e?.data?.message ?? e?.statusMessage ?? fallback
}
