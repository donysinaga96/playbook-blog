// Cek di browser sungguhan (Chromium headless lewat Playwright), hanya
// untuk dijalankan lokal, tidak di CI:
//   - halaman ter-hydrate (aplikasi Vue terpasang di browser),
//   - tanpa peringatan hydration mismatch, page error, atau console error,
//   - screenshot full page per halaman, lebar desktop dan ponsel.
//
// Target bawaan: dev server yang sedang jalan (`pnpm dev`), karena hanya
// build dev yang mencetak peringatan hydration mismatch.
//
//   pnpm --filter @framework/web browser-check
//   BASE_URL='http://{host}:3000' SHOTS_DIR=/tmp/shots pnpm --filter @framework/web browser-check
//
// Browser: `pnpm --filter @framework/web exec playwright install chromium`.
// Mesin tanpa library sistem Chromium (libnss3, libnspr4, libasound2) dan
// tanpa sudo: ekstrak paketnya ke sebuah folder lalu isi BROWSER_LIB_DIR
// (lihat docs/dev-setup.md).
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const base = process.env.BASE_URL ?? 'http://{host}:3000'
if (!base.includes('{host}')) {
  console.error(`[browser] BASE_URL harus memuat {host}, mis. http://{host}:3000 (sekarang: ${base})`)
  process.exit(1)
}
const shotsDir = process.env.SHOTS_DIR ?? fileURLToPath(new URL('../.browser-check/', import.meta.url))
const libDir = process.env.BROWSER_LIB_DIR

/** [host, path, status yang diharapkan]. Satu contoh per jenis halaman, kedua site. */
const PAGES = [
  ['tekno.localhost', '/', 200],
  ['tekno.localhost', '/?page=2', 200],
  ['tekno.localhost', '/review/ponsel-lipat-makin-murah', 200],
  ['tekno.localhost', '/category/gadget', 200],
  ['tekno.localhost', '/tag/android', 200],
  ['tekno.localhost', '/author/budi-santoso', 200],
  ['tekno.localhost', '/search?q=ponsel', 200],
  ['tekno.localhost', '/tidak/ada', 404],
  ['kuliner.localhost', '/', 200],
  ['kuliner.localhost', '/sumatera/rendang-padang-empuk', 200],
  ['kuliner.localhost', '/category/resep', 200],
  ['kuliner.localhost', '/p/kontak', 200],
]
const VIEWPORTS = [['desktop', 1280, 900], ['ponsel', 390, 844]]

let chromium
try {
  ;({ chromium } = await import('playwright'))
} catch {
  console.error('[browser] Playwright belum terpasang: pnpm install, lalu pnpm --filter @framework/web exec playwright install chromium')
  process.exit(1)
}

mkdirSync(shotsDir, { recursive: true })
const browser = await chromium.launch({
  env: libDir ? { ...process.env, LD_LIBRARY_PATH: [libDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') } : process.env,
}).catch((error) => {
  console.error(`[browser] Chromium gagal start: ${error.message.split('\n')[0]}`)
  console.error('[browser] Library sistem kurang? Lihat "Cek di browser" di docs/dev-setup.md (BROWSER_LIB_DIR).')
  process.exit(1)
})

const failures = []
try {
  for (const [host, path, expected] of PAGES) {
    for (const [label, width, height] of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width, height } })
      const page = await context.newPage()
      const messages = []
      const url = base.replace('{host}', host) + path
      page.on('console', (m) => {
        if (m.type() !== 'error' && m.type() !== 'warning') return
        // Status 404 dokumen halaman 404 itu sendiri bukan masalah; 404 aset lain tetap dicatat.
        if (expected === 404 && /status of 404/.test(m.text()) && m.location().url === url) return
        messages.push(`${m.type()}: ${m.text()}`)
      })
      page.on('pageerror', (e) => messages.push(`pageerror: ${e.message}`))

      const problems = []
      try {
        const response = await page.goto(url, { waitUntil: 'networkidle' })
        // Dievaluasi di browser (bukan Node), jadi ditulis sebagai ekspresi.
        const hydrated = await page.evaluate("Boolean(document.querySelector('#__nuxt')?.__vue_app__)")
        if (response?.status() !== expected) problems.push(`status ${response?.status()}, seharusnya ${expected}`)
        if (!hydrated) problems.push('tidak ter-hydrate')
        for (const m of messages) problems.push(m.slice(0, 300))
        const name = `${host}${path}`.replace(/[^a-z0-9]+/gi, '_').replace(/_$/, '')
        await page.screenshot({ path: `${shotsDir}/${name}.${label}.png`, fullPage: true })
      } catch (error) {
        problems.push(`gagal dibuka: ${error.message.split('\n')[0]}`)
      }
      console.log(`[browser] ${problems.length ? 'GAGAL' : 'OK   '} ${label.padEnd(7)} ${url}`)
      for (const p of problems) console.log(`          ${p}`)
      if (problems.length) failures.push(`${label} ${url}`)
      await context.close()
    }
  }
} finally {
  await browser.close()
}

console.log(`[browser] screenshot: ${shotsDir}`)
if (failures.length) {
  console.error(`[browser] GAGAL: ${failures.length} halaman bermasalah`)
  process.exitCode = 1
} else {
  console.log(`[browser] OK: ${PAGES.length * VIEWPORTS.length} halaman ter-hydrate tanpa mismatch atau error`)
}
