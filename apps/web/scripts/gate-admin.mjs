// Gate admin (ADR-009, usulan M4-F) terhadap server hasil build.
//
// 4.0: host admin dan domain site (termasuk path ter-encode), penjaga Origin,
// login salah/benar, sesi, logout, dan rate limit login.
// 4.2: API per site (404 site lain, 422 input salah, 409 versi lama).
// 4.3: upload media. 4.4: tema dan pratinjau. Alur buat-jadwalkan-tampilkan artikel
// ditambahkan di 4.6.
//
// Butuh database ber-seed dan env: ADMIN_SESSION_SECRET, ADMIN_HOST,
// ADMIN_PASSWORD (password admin yang dibuat lewat `pnpm admin:create`),
// ADMIN_EMAIL (default admin@local.test), dan user editor@local.test yang
// hanya anggota kabar-tekno, dengan password yang sama:
//   ADMIN_PASSWORD=... pnpm admin:create --email editor@local.test --name Editor --site kabar-tekno
//
//   pnpm build && pnpm --filter @framework/web gate:admin
import { requestWithHost, startBuiltServer } from './lib/built-server.mjs'

const port = process.env.GATE_ADMIN_PORT ?? '3996'
const adminHost = process.env.ADMIN_HOST
const email = process.env.ADMIN_EMAIL ?? 'admin@local.test'
const password = process.env.ADMIN_PASSWORD
const siteHost = process.env.GATE_SITE_HOST ?? 'tekno.localhost'
/** User anggota kabar-tekno saja, password sama (ADMIN_PASSWORD); dibuat lewat admin:create. */
const editorEmail = process.env.GATE_EDITOR_EMAIL ?? 'editor@local.test'

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

  // API per site (4.2). Tidak menulis apa pun: input salah ditolak sebelum
  // disimpan, dan versi yang dikirim sengaja salah.
  r = await admin('/api/admin/login', { method: 'POST', body: { email, password } })
  const adminCookie = sessionCookie(r)?.header
  const sites = JSON.parse(r.body).sites
  const tekno = sites.find((s) => s.code === 'kabar-tekno')
  const kuliner = sites.find((s) => s.code === 'dapur-nusantara')
  r = await admin(`/api/admin/sites/${tekno.id}/articles`, { cookie: adminCookie })
  const teknoArticles = JSON.parse(r.body)
  check('daftar artikel site 200', r.status === 200 && teknoArticles.items.length > 0, String(r.status))
  const sample = teknoArticles.items[0]
  r = await admin(`/api/admin/sites/${kuliner.id}/articles/${sample.id}`, { cookie: adminCookie })
  check('artikel site A lewat URL site B 404', r.status === 404, String(r.status))
  r = await admin(`/api/admin/sites/${tekno.id}/articles`, { method: 'POST', cookie: adminCookie, body: { title: '', body: { version: 1, blocks: [] }, categoryId: '' } })
  const invalid = r.status === 422 ? JSON.parse(r.body) : null
  check('input salah 422 dengan issue per field', r.status === 422 && invalid?.data?.issues?.some((i) => i.field === 'title'), String(r.status))
  r = await admin(`/api/admin/sites/${tekno.id}/articles/${sample.id}`, { cookie: adminCookie })
  const full = JSON.parse(r.body)
  r = await admin(`/api/admin/sites/${tekno.id}/articles/${sample.id}`, { method: 'PUT', cookie: adminCookie, body: { article: { title: full.title, body: full.body, categoryId: full.categoryId }, version: full.version + 1000 } })
  check('simpan dengan versi lama 409', r.status === 409, String(r.status))
  r = await admin(`/api/admin/sites/00000000-0000-7000-8000-000000000000/articles`, { cookie: adminCookie })
  check('site tidak dikenal 404', r.status === 404, String(r.status))

  // Upload media (4.3): tipe dari isi file, alt wajib, file palsu ditolak.
  // Media uji dihapus lagi, jadi gate tidak meninggalkan data.
  const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  const upload = async (file, name, fields) => {
    const boundary = `gate${Date.now()}`
    const parts = [
      ...Object.entries(fields).map(([k, v]) => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`)),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: image/png\r\n\r\n`), file, Buffer.from(`\r\n--${boundary}--\r\n`),
    ]
    const body = Buffer.concat(parts)
    return requestWithHost(port, { method: 'POST', path: `/api/admin/sites/${tekno.id}/media`, host, headers: { origin, cookie: adminCookie, 'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': String(body.length) }, rawBody: body })
  }
  r = await upload(png1x1, 'gambar.jpg', { altText: 'Uji gate' })
  const uploadedMedia = r.status === 200 ? JSON.parse(r.body) : null
  check('upload PNG asli: tipe dan dimensi dari isi file', r.status === 200 && uploadedMedia?.mimeType === 'image/png' && uploadedMedia.width === 1 && uploadedMedia.storageKey.endsWith('.png'), `${r.status} ${r.body.slice(0, 120)}`)
  r = await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'gambar.png', { altText: 'x' })
  check('upload SVG bernama .png ditolak 415', r.status === 415, String(r.status))
  r = await upload(png1x1, 'a.png', {})
  check('upload tanpa teks alternatif 422', r.status === 422, String(r.status))
  if (uploadedMedia) {
    r = await admin(`/api/admin/sites/${tekno.id}/media/${uploadedMedia.id}/file`, { cookie: adminCookie })
    check('pratinjau admin: file sama, nosniff', r.status === 200 && r.headers['x-content-type-options'] === 'nosniff' && r.headers['content-type'] === 'image/png', `${r.status} ${r.headers['content-type']}`)
    r = await admin(`/api/admin/sites/${kuliner.id}/media/${uploadedMedia.id}/file`, { cookie: adminCookie })
    check('media site A lewat URL site B 404', r.status === 404, String(r.status))
    r = await admin(`/api/admin/sites/${tekno.id}/media/${uploadedMedia.id}?updatedAt=${encodeURIComponent(uploadedMedia.updatedAt)}`, { method: 'DELETE', cookie: adminCookie })
    check('hapus media uji', r.status === 200, String(r.status))
  }

  // Tema (4.4): deskripsi form dari manifest, draf salah ditolak, pratinjau
  // SSR noindex dari sesi. Tidak menyimpan apa pun.
  r = await admin(`/api/admin/sites/${tekno.id}/theme`, { cookie: adminCookie })
  const theme = r.status === 200 ? JSON.parse(r.body) : null
  check('tema: template dengan skema form', r.status === 200 && theme.templates.some((x) => x.key === 'magazine' && x.tokens.schema.properties.color), String(r.status))
  r = await admin(`/api/admin/sites/${tekno.id}/theme/preview`, { method: 'POST', cookie: adminCookie, body: { templateKey: 'magazine', draft: { tokens: { color: { primary: 'merah' } } } } })
  check('pratinjau draf salah 422', r.status === 422, String(r.status))
  const magazine = theme?.templates.find((x) => x.key === 'magazine')
  const draft = { tokens: { ...magazine?.config.tokens, color: { ...magazine?.config.tokens.color, primary: '#123456' } }, options: magazine?.config.options, layouts: {} }
  r = await admin(`/api/admin/sites/${tekno.id}/theme/preview`, { method: 'POST', cookie: adminCookie, body: { templateKey: 'magazine', draft } })
  const preview = r.status === 200 ? JSON.parse(r.body) : { base: '/admin/preview/kabar-tekno', draftId: '' }
  const previewUrl = `${preview.base}/?draft=${preview.draftId}`
  r = await admin(previewUrl, { cookie: adminCookie })
  check('pratinjau SSR memakai draf, noindex', r.status === 200 && r.body.includes('--color-primary:#123456') && r.headers['x-robots-tag']?.includes('noindex'), `${r.status} ${r.headers['x-robots-tag']}`)
  r = await admin(`${preview.base}/?draft=00000000-0000-4000-8000-000000000000`, { cookie: adminCookie })
  check('id draf tidak dikenal: pratinjau memakai theme aktif', r.status === 200 && !r.body.includes('--color-primary:#123456'), String(r.status))
  r = await admin(previewUrl)
  check('pratinjau tanpa sesi ditolak, tanpa isi site', r.status === 401 && !r.body.includes('--color-primary'), `${r.status}`)
  r = await requestWithHost(port, { path: '/', host: siteHost })
  check('pratinjau tidak mengubah site', r.status === 200 && !r.body.includes('--color-primary:#123456'), String(r.status))
  r = await admin('/admin/preview-media/kabar-tekno/logo.svg')
  check('media pratinjau tanpa sesi 401', r.status === 401, `${r.status} ${r.body.slice(0, 160)}`)
  r = await admin('/admin/preview-media/kabar-tekno/logo.svg', { cookie: adminCookie })
  check('media pratinjau dengan sesi: diizinkan (file seed tidak ada di build = 404 dari route)', r.status === 200 || (r.status === 404 && r.body.startsWith('Media tidak ditemukan')), `${r.status} ${r.body.slice(0, 160)}`)

  // User yang hanya anggota satu site tidak bisa membuka site lain.
  r = await admin('/api/admin/login', { method: 'POST', body: { email: editorEmail, password } })
  const editorCookie = sessionCookie(r)?.header
  check('login editor (anggota satu site)', r.status === 200 && Boolean(editorCookie), `${r.status}: buat dulu dengan pnpm admin:create --email ${editorEmail} --name Editor --site kabar-tekno`)
  r = await admin(`/api/admin/sites/${tekno.id}/articles`, { cookie: editorCookie })
  check('editor: site sendiri 200', r.status === 200, String(r.status))
  r = await admin(`/api/admin/sites/${kuliner.id}/articles`, { cookie: editorCookie })
  check('editor: site lain 404', r.status === 404, String(r.status))

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
