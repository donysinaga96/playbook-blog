// Gate admin (ADR-009, usulan M4-F) terhadap server hasil build.
//
// 4.0: host admin dan domain site (termasuk path ter-encode), penjaga Origin,
// login salah/benar, sesi, logout, dan rate limit login. Alur buat-jadwalkan-tampilkan artikel
// ditambahkan di 4.6.
//
// Butuh database ber-seed dan env: ADMIN_SESSION_SECRET, ADMIN_HOST,
// ADMIN_PASSWORD (password admin yang dibuat lewat `pnpm admin:create`),
// ADMIN_EMAIL (default admin@local.test).
//
//   pnpm build && pnpm --filter @framework/web gate:admin
import { requestWithHost, startBuiltServer } from './lib/built-server.mjs'

const port = process.env.GATE_ADMIN_PORT ?? '3996'
const adminHost = process.env.ADMIN_HOST
const email = process.env.ADMIN_EMAIL ?? 'admin@local.test'
const password = process.env.ADMIN_PASSWORD
const siteHost = process.env.GATE_SITE_HOST ?? 'tekno.localhost'

if (!adminHost || !password || !process.env.ADMIN_SESSION_SECRET) {
  console.error('[gate-admin] ADMIN_HOST, ADMIN_SESSION_SECRET, dan ADMIN_PASSWORD wajib diisi')
  process.exit(1)
}

const origin = `http://${adminHost}:${port}`
const host = `${adminHost}:${port}`
const failures = []
let passed = 0

function check(label, condition, detail = '') {
  if (condition) passed++
  else failures.push(`${label}${detail ? `: ${detail}` : ''}`)
}

/** Request ke host admin; `cookie` dari login sebelumnya. */
function admin(path, { method = 'GET', body, cookie, withOrigin = true, originHeader } = {}) {
  const headers = {}
  if (method !== 'GET' && withOrigin) headers.origin = originHeader ?? origin
  if (cookie) headers.cookie = cookie
  return requestWithHost(port, { method, path, host, headers, body })
}

function sessionCookie(response) {
  const setCookie = [response.headers['set-cookie'] ?? []].flat()
  const found = setCookie.find((c) => c.startsWith('blog_admin='))
  return found ? { header: found.split(';')[0], raw: found } : null
}

const server = await startBuiltServer({ port, label: 'gate-admin' })
try {
  if (server.response?.status !== 200) throw new Error(`server/database tidak siap (${server.healthUrl} -> ${server.response?.status ?? 'tidak menjawab'})`)

  // Routing: admin hanya di host admin.
  let r = await admin('/')
  check('host admin / diarahkan ke /admin', r.status === 302 && r.headers.location === '/admin', `${r.status} ${r.headers.location}`)
  r = await admin('/admin')
  check('host admin /admin (SPA) 200', r.status === 200 && r.body.includes('<div id="__nuxt"'), String(r.status))
  r = await requestWithHost(port, { path: '/admin', host: siteHost })
  check('domain site /admin 404', r.status === 404, String(r.status))
  r = await requestWithHost(port, { path: '/api/admin/me', host: siteHost })
  check('domain site /api/admin/me 404', r.status === 404, String(r.status))
  r = await requestWithHost(port, { path: '/', host: siteHost })
  check('domain site / tetap halaman publik', r.status === 200 && r.body.includes('class="tpl '), String(r.status))

  // Path ter-encode (/api/%61dmin = /api/admin bagi router) tidak boleh lolos
  // dari aturan host maupun Origin (temuan security review 21 Nov 2026).
  r = await requestWithHost(port, { path: '/api/%61dmin/me', host: siteHost })
  check('domain site /api/%61dmin/me 404', r.status === 404, String(r.status))
  r = await requestWithHost(port, { path: '/%61dmin', host: siteHost })
  check('domain site /%61dmin 404', r.status === 404, String(r.status))
  r = await requestWithHost(port, { method: 'POST', path: '/api/%61dmin/login', host: siteHost, body: { email, password } })
  check('domain site POST /api/%61dmin/login ditolak', r.status === 404 && !sessionCookie(r), String(r.status))
  r = await admin('/api/%61dmin/login', { method: 'POST', body: { email, password }, originHeader: 'http://evil.test' })
  check('host admin POST /api/%61dmin/login dengan Origin lain ditolak', (r.status === 403 || r.status === 302) && !sessionCookie(r), String(r.status))
  r = await admin('/api/admin/%6cogin', { method: 'POST', body: { email, password }, originHeader: 'http://evil.test' })
  check('host admin POST /api/admin/%6cogin dengan Origin lain 403', r.status === 403 && !sessionCookie(r), String(r.status))

  // Penjaga Origin dan tanpa cache.
  r = await admin('/api/admin/login', { method: 'POST', body: { email, password }, withOrigin: false })
  check('login tanpa Origin 403', r.status === 403, String(r.status))
  r = await admin('/api/admin/login', { method: 'POST', body: { email, password }, originHeader: 'http://evil.test' })
  check('login dengan Origin lain 403', r.status === 403, String(r.status))
  r = await admin('/api/admin/me')
  check('me tanpa sesi 401, no-store', r.status === 401 && r.headers['cache-control'] === 'no-store', `${r.status} ${r.headers['cache-control']}`)

  // Login salah: pesan sama untuk semua sebab.
  const wrong = await admin('/api/admin/login', { method: 'POST', body: { email, password: `${password}-salah` } })
  const unknown = await admin('/api/admin/login', { method: 'POST', body: { email: 'tidak-ada@local.test', password } })
  check('login salah 401', wrong.status === 401, String(wrong.status))
  check('pesan login gagal seragam', wrong.status === unknown.status && JSON.parse(wrong.body).statusMessage === JSON.parse(unknown.body).statusMessage)

  // Login benar -> sesi -> me -> logout.
  r = await admin('/api/admin/login', { method: 'POST', body: { email, password } })
  const cookie = sessionCookie(r)
  check('login benar 200 dengan cookie sesi', r.status === 200 && cookie !== null, String(r.status))
  check('cookie sesi HttpOnly + SameSite=Lax', /httponly/i.test(cookie?.raw ?? '') && /samesite=lax/i.test(cookie?.raw ?? ''), cookie?.raw)
  check('respons login tanpa hash password', !r.body.includes('argon2') && !r.body.includes('passwordHash'))
  r = await admin('/api/admin/me', { cookie: cookie?.header })
  const me = r.status === 200 ? JSON.parse(r.body) : null
  check('me dengan sesi 200', r.status === 200 && me?.user?.email === email && me.sites.length > 0, String(r.status))
  r = await admin('/api/admin/logout', { method: 'POST', cookie: cookie?.header })
  const cleared = sessionCookie(r)
  check('logout menghapus cookie', r.status === 200 && cleared !== null && /max-age=0|expires=thu, 01 jan 1970/i.test(cleared.raw), cleared?.raw)

  // Rate limit: 5 kegagalan per IP + email -> 429 dengan Retry-After.
  const victim = `gate-${Date.now()}@local.test`
  for (let i = 0; i < 5; i++) await admin('/api/admin/login', { method: 'POST', body: { email: victim, password: 'salah-salah-salah' } })
  r = await admin('/api/admin/login', { method: 'POST', body: { email: victim, password: 'salah-salah-salah' } })
  check('percobaan ke-6 ditolak 429 + Retry-After', r.status === 429 && Number(r.headers['retry-after']) > 0, `${r.status} ${r.headers['retry-after']}`)

  // Percobaan paralel tidak boleh lolos semua (dicatat sebelum verifikasi password).
  const burst = `gate-burst-${Date.now()}@local.test`
  const results = await Promise.all(Array.from({ length: 10 }, () => admin('/api/admin/login', { method: 'POST', body: { email: burst, password: 'salah-salah-salah' } })))
  const statuses = results.map((x) => x.status)
  check('10 login paralel: paling banyak 5 diverifikasi, sisanya 429', statuses.filter((s) => s === 401).length <= 5 && statuses.filter((s) => s === 429).length >= 5, statuses.join(','))
} catch (error) {
  failures.push(String(error))
} finally {
  server.stop()
}

if (failures.length) {
  console.error(`[gate-admin] GAGAL: ${failures.length} pemeriksaan`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exitCode = 1
} else {
  console.log(`[gate-admin] OK: ${passed} pemeriksaan admin lulus`)
}
