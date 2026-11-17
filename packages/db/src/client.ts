import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { relations } from './schema/relations'

export interface DatabaseOptions {
  /** postgres://user:password@host:port/db  — aplikasi memakai role blog_app. */
  connectionString: string
  /** Jumlah koneksi maksimum di pool. Default 10. */
  max?: number
  /** Nama aplikasi yang terlihat di pg_stat_activity. */
  applicationName?: string
}

export type Database = ReturnType<typeof createDatabase>

/**
 * Membuat pool + instance Drizzle. Tidak ada singleton di sini: pemanggil
 * (apps/web) yang menyimpan satu instance per proses dan memanggil
 * `$client.end()` saat shutdown.
 */
export function createDatabase(options: DatabaseOptions) {
  const pool = new pg.Pool({
    connectionString: options.connectionString,
    max: options.max ?? 10,
    application_name: options.applicationName ?? 'blog-framework',
  })
  return drizzle({ client: pool, relations })
}

/** Membaca DATABASE_URL dari environment; gagal dengan pesan jelas bila kosong. */
export function databaseUrlFromEnv(env: Record<string, string | undefined> = process.env): string {
  const url = env['DATABASE_URL']
  if (!url) throw new Error('DATABASE_URL belum di-set (lihat .env.example)')
  return url
}
