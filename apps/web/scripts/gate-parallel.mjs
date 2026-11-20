// Gate M2: "dua domain dari satu server tampil berbeda; request paralel tidak
// saling tertukar" (ADR-001: tanpa state global di SSR).
//
// Menjalankan server hasil build, lalu mengirim banyak request BERSAMAAN ke
// dua domain seed dalam urutan acak. Setiap respons wajib memuat penanda
// site-nya sendiri (judul, kelas root template, token CSS, logo, menu) dan
// tidak boleh memuat satu pun penanda site lain, termasuk di payload Nuxt.
//
//   pnpm --filter @framework/web gate        (butuh database ber-seed)
//   GATE_ROUNDS=50 GATE_CONCURRENCY=64 ...   (default 20 putaran, 32 paralel)
import { getWithHost, startBuiltServer } from './lib/built-server.mjs'

const port = process.env.GATE_PORT ?? '3997'
const rounds = Number(process.env.GATE_ROUNDS ?? '20')
const concurrency = Number(process.env.GATE_CONCURRENCY ?? '32')

/** Penanda per site, dari data seed (packages/db/seed). */
const SITES = {
  'tekno.localhost': {
    title: /<title>[^<]*Kabar Tekno[^<]*<\/title>/,
    markers: ['class="tpl tpl-magazine"', '.tpl-magazine{--color-primary:#0f62fe', '/media/kabar-tekno/logo.svg', '>Gadget</a>', 'Kabar Tekno'],
    paths: [['/', 200], ['/review/ponsel-lipat-makin-murah', 200], ['/category/gadget', 200], ['/tag/android', 200], ['/search?q=ponsel', 200], ['/tidak/ada', 404]],
  },
  'kuliner.localhost': {
    title: /<title>[^<]*Dapur Nusantara[^<]*<\/title>/,
    markers: ['class="tpl tpl-base"', '.tpl-base{--color-primary:#b3261e', '/media/dapur-nusantara/logo.svg', '>Resep</a>', 'Dapur Nusantara'],
    paths: [['/', 200], ['/sumatera/rendang-padang-empuk', 200], ['/category/resep', 200], ['/p/kontak', 200], ['/search?q=rendang', 200], ['/tidak/ada', 404]],
  },
}

/** Penanda site lain yang tidak boleh muncul di respons site ini. */
function foreignMarkers(host) {
  return Object.entries(SITES).filter(([h]) => h !== host).flatMap(([, s]) => s.markers)
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

const jobs = shuffle(Array.from({ length: rounds }, () =>
  Object.entries(SITES).flatMap(([host, site]) => site.paths.map(([path, status]) => ({ host, path, status })))).flat())

const server = await startBuiltServer({ port, label: 'gate' })
const failures = []
try {
  if (server.response?.status !== 200) throw new Error(`server/database tidak siap (${server.healthUrl} -> ${server.response?.status ?? 'tidak menjawab'})`)

  let next = 0
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++]
      const { status, body } = await getWithHost(port, job.path, job.host)
      const site = SITES[job.host]
      const problems = []
      if (status !== job.status) problems.push(`status ${status}, seharusnya ${job.status}`)
      if (!site.title.test(body)) problems.push('judul bukan milik site ini')
      for (const marker of site.markers) if (!body.includes(marker)) problems.push(`tanpa penanda sendiri ${JSON.stringify(marker)}`)
      for (const marker of foreignMarkers(job.host)) if (body.includes(marker)) problems.push(`memuat penanda site lain ${JSON.stringify(marker)}`)
      if (problems.length) failures.push(`${job.host}${job.path}: ${problems.join('; ')}`)
    }
  }
  const started = Date.now()
  await Promise.all(Array.from({ length: concurrency }, worker))
  console.log(`[gate] ${jobs.length} request ke ${Object.keys(SITES).length} domain, ${concurrency} paralel, ${Date.now() - started} ms`)
} catch (error) {
  failures.push(String(error))
} finally {
  server.stop()
}

if (failures.length) {
  console.error(`[gate] GAGAL: ${failures.length} respons bermasalah`)
  for (const f of failures.slice(0, 10)) console.error(`  - ${f}`)
  process.exitCode = 1
} else {
  console.log('[gate] OK: setiap respons hanya memuat data site-nya sendiri')
}
