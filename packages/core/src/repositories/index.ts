import type { Database } from '@framework/db'
import { createContentRepository } from './content-repository'
import { createUserRepository } from './user-repository'
import { createMenuRepository } from './menu-repository'
import { createSiteRepository } from './site-repository'
import type { RepositoryContext } from './types'

export * from './content-repository'
export * from './menu-repository'
export * from './site-repository'
export * from './types'
export * from './user-repository'

export interface RepositoryOptions {
  /** Jam untuk aturan "sudah terbit"; default jam sistem. Disuntik di test. */
  now?: () => Date
}

/**
 * Semua repository untuk satu koneksi database. Buat satu per proses.
 *
 *   sites    resolver Host/kode -> site, theme aktif
 *   content  artikel, halaman, kategori, tag, penulis, pencarian, redirect
 *   menus    menu sebagai pohon
 *
 * Kecuali resolver di `sites`, setiap fungsi menerima siteId sebagai argumen
 * pertama dan hanya mengembalikan data site itu.
 */
export function createRepositories(db: Database, options: RepositoryOptions = {}) {
  const ctx: RepositoryContext = { db, now: options.now ?? (() => new Date()) }
  return {
    sites: createSiteRepository(ctx),
    content: createContentRepository(ctx),
    menus: createMenuRepository(ctx),
    users: createUserRepository(ctx),
  }
}

export type Repositories = ReturnType<typeof createRepositories>
