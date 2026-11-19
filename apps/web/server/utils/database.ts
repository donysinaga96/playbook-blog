// Satu koneksi database (pool) dan satu set repository per PROSES server.
// Ini bukan state per request: semua yang khusus request (site, theme) wajib
// disimpan di event.context, tidak di modul (ADR-001).
import { createRepositories, type Repositories } from '@framework/core'
import { createDatabase, databaseUrlFromEnv, type Database } from '@framework/db'

let database: Database | undefined
let repositories: Repositories | undefined

/** Pool dibuat saat pertama dipakai, agar `nuxt build` tidak butuh DATABASE_URL. */
export function useDatabase(): Database {
  database ??= createDatabase({
    connectionString: databaseUrlFromEnv(),
    applicationName: 'blog-framework-web',
  })
  return database
}

export function useRepositories(): Repositories {
  repositories ??= createRepositories(useDatabase())
  return repositories
}

/** Dipanggil saat server berhenti (server/plugins/database.ts). */
export async function closeDatabase(): Promise<void> {
  const current = database
  database = undefined
  repositories = undefined
  await current?.$client.end()
}
