// Tarik data pendapatan dari CLI (ADR-011), untuk cron/systemd timer di
// produksi (satu mesin) atau uji manual:
//
//   pnpm revenue:sync --due                         semua sumber yang sudah waktunya
//   pnpm revenue:sync --source adsterra             satu sumber, jendela lookback
//   pnpm revenue:sync --source adsense --from 2026-10-01 --to 2026-10-31
//
// Kredensial dari env (lihat .env.example, bagian Pendapatan). Exit code 1
// bila ada run yang gagal, agar cron/monitoring bisa menangkapnya.
import { parseArgs } from 'node:util'
import { createRepositories, createRevenueService, revenueSettingsFromEnv } from '@framework/core'
import { createDatabase, databaseUrlFromEnv } from '@framework/db'

const { values } = parseArgs({ options: { source: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, due: { type: 'boolean', default: false } } })
if (!values.due && !values.source) {
  console.error('pakai --due atau --source <kode>')
  process.exit(2)
}

const db = createDatabase({ connectionString: databaseUrlFromEnv(), max: 2, applicationName: 'revenue-sync' })
const repos = createRepositories(db, { revenue: revenueSettingsFromEnv(process.env) })
const service = createRevenueService({ revenue: repos.revenue, queries: repos.revenueQueries }, { env: process.env, fetch: (input, init) => fetch(input, init), now: () => new Date() })

let failed = 0
try {
  const codes = values.due ? (await service.dueSources(new Date())).map((s) => s.code) : [values.source as string]
  if (!codes.length) console.log('tidak ada sumber yang perlu ditarik sekarang')
  for (const code of codes) {
    try {
      const r = await service.sync(code, { trigger: 'cli', from: values.from, to: values.to })
      const c = r.counts
      console.log(`${code}: ${r.status}${r.mock ? ' (mock)' : ''} ${r.range.start}..${r.range.end} | ${r.rowsFetched} baris: ${c.inserted} baru, ${c.updated} diperbarui, ${c.unchanged} sama, ${c.skipped} dilewati, ${c.failed} gagal${r.error ? ` | ${r.error}` : ''}`)
      if (r.status !== 'success') failed++
    } catch (error) {
      failed++
      console.error(`${code}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} finally {
  await db.$client.end()
}
process.exit(failed ? 1 : 0)
