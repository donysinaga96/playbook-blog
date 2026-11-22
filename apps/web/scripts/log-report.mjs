// Ringkasan log request per site (M5 5.5): jumlah, 4xx, 5xx, p50, p95, maks.
// Membaca log JSON (plugins/request-log.ts) dari file atau stdin; baris lain
// (log teks, peringatan) dilewati.
//
//   node scripts/log-report.mjs server.log
//   docker compose logs app --no-log-prefix | node scripts/log-report.mjs
//   ... | node scripts/log-report.mjs --since 2026-11-22T00:00:00Z
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

const args = process.argv.slice(2)
const sinceAt = args.indexOf('--since')
const since = sinceAt >= 0 ? new Date(args[sinceAt + 1] ?? '') : null
if (since && Number.isNaN(since.getTime())) {
  console.error('[log-report] --since butuh tanggal ISO 8601')
  process.exit(1)
}
const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--since')

const bySite = new Map()
const lines = createInterface({ input: file ? createReadStream(file) : process.stdin, crlfDelay: Infinity })
for await (const line of lines) {
  if (!line.startsWith('{')) continue
  let entry
  try {
    entry = JSON.parse(line)
  } catch {
    continue
  }
  if (entry.msg !== 'request' || typeof entry.ms !== 'number') continue
  if (since && new Date(entry.time) < since) continue
  const key = entry.site ?? (String(entry.path).startsWith('/api/admin') || String(entry.path).startsWith('/admin') ? '(admin)' : '(tanpa site)')
  const s = bySite.get(key) ?? { ms: [], c4: 0, c5: 0 }
  s.ms.push(entry.ms)
  if (entry.status >= 500) s.c5++
  else if (entry.status >= 400) s.c4++
  bySite.set(key, s)
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0
const rows = [...bySite.entries()].sort((a, b) => b[1].ms.length - a[1].ms.length).map(([site, s]) => {
  const sorted = [...s.ms].sort((a, b) => a - b)
  return { site, request: sorted.length, '4xx': s.c4, '5xx': s.c5, 'p50 ms': pct(sorted, 50), 'p95 ms': pct(sorted, 95), 'maks ms': sorted.at(-1) ?? 0 }
})
if (rows.length === 0) console.log('[log-report] tidak ada log request JSON')
else console.table(rows)
