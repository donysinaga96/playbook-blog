import type { Database } from '@framework/db'

/** UUID site (sites.id). Semua repository konten menerimanya sebagai argumen PERTAMA. */
export type SiteId = string

export interface RepositoryContext {
  db: Database
  /**
   * Jam yang dipakai untuk aturan "sudah terbit" (published_at <= now).
   * Disuntik agar test deterministik; default jam sistem.
   */
  now: () => Date
}

/**
 * Bentuk yang wajib dipenuhi setiap fungsi repository konten: argumen
 * pertama adalah siteId. Dicek compiler lewat `satisfies` di tiap factory,
 * dan dicek saat runtime di repositories.test.ts.
 */
export type SiteScoped = (siteId: SiteId, ...args: never[]) => Promise<unknown>

export interface Page<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface PageQuery {
  /** Mulai dari 1. Nilai tidak valid dianggap 1. */
  page?: number
  /** Default 10, maksimum 50. */
  pageSize?: number
}

export const DEFAULT_PAGE_SIZE = 10
export const MAX_PAGE_SIZE = 50
/** Nomor halaman terbesar yang diterima; lebih dari itu dianggap halaman terakhir yang mungkin. */
export const MAX_PAGE = 100_000

export function normalizePaging(query: PageQuery = {}): { page: number; pageSize: number; offset: number } {
  // Dibatasi agar OFFSET tidak melampaui bigint PostgreSQL (mis. ?page=1e20).
  const page = Number.isInteger(query.page) && (query.page as number) >= 1 ? Math.min(query.page as number, MAX_PAGE) : 1
  const rawSize = Number.isInteger(query.pageSize) ? (query.pageSize as number) : DEFAULT_PAGE_SIZE
  const pageSize = Math.min(Math.max(rawSize, 1), MAX_PAGE_SIZE)
  return { page, pageSize, offset: (page - 1) * pageSize }
}

export function toPage<T>(items: T[], total: number, page: number, pageSize: number): Page<T> {
  return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
}

export const emptyPage = <T>(paging: { page: number; pageSize: number }): Page<T> =>
  toPage<T>([], 0, paging.page, paging.pageSize)

/** Referensi media yang cukup untuk komponen SmartImage (titik fokus + rasio). */
export interface MediaRef {
  id: string
  storageKey: string
  mimeType: string
  width: number | null
  height: number | null
  altText: string | null
  caption: string | null
  credit: string | null
  focalX: number
  focalY: number
}
