// drizzle-kit dipakai HANYA untuk `pull` (schema TypeScript dari database).
// Migration ditulis SQL tangan di migrations/ (ADR-003); jangan pakai
// drizzle-kit generate/migrate/push.
import { existsSync } from 'node:fs'
import { defineConfig } from 'drizzle-kit'

const rootEnv = new URL('../../.env', import.meta.url)
if (!process.env['DATABASE_URL'] && existsSync(rootEnv)) process.loadEnvFile(rootEnv)

const url = process.env['DATABASE_URL']
if (!url) throw new Error('DATABASE_URL belum di-set (lihat .env.example)')

export default defineConfig({
  dialect: 'postgresql',
  dbCredentials: { url },
  out: './drizzle',
  schemaFilter: ['public'],
  // Catatan runner, bukan bagian schema aplikasi; blog_app juga tidak punya akses.
  tablesFilter: ['!schema_migrations'],
  introspect: { casing: 'camel' },
})
