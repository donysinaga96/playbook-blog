// Gate M5a (ADR-010, usulan K5) terhadap server hasil build.
//
// Meniru AI agent: hasil AI ditulis langsung ke database sebagai role agent
// (blog_agent), lalu dibuktikan bahwa:
//  - agent tidak bisa menulis tabel konten atau mengisi status/keputusan;
//  - hasil AI tidak tampil di web (URL artikel, home, sitemap, RSS, pencarian);
//  - hasil yang rusak tidak bisa di-approve, dan tolak = ARCHIVED;
//  - approve lewat API admin membuat artikel tampil di semua tempat itu,
//    dengan bagian referensi, sumber gambar, tautan sumber video, dan JSON-LD citation;
//  - hasil yang sudah diputuskan tidak bisa diubah agent.
// Pemilik proyek tidak menulis SQL apa pun. Artikel uji diarsipkan di akhir.
//
// Koneksi agent:
//  - AGENT_DATABASE_URL (CI): login langsung sebagai role agent, sekaligus
//    membuktikan role itu bisa login;
//  - tanpa itu (lokal, role agent NOLOGIN): koneksi pemilik schema
//    (POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB, host PGHOST atau localhost)
//    lalu SET LOCAL ROLE <AGENT_DB_USER> di setiap transaksi.
// Butuh juga MEDIA_DIR (file gambar uji ditulis ke sana) dan env gate admin
// (ADMIN_HOST, ADMIN_SESSION_SECRET, ADMIN_PASSWORD).
//
//   pnpm build && pnpm --filter @framework/web gate:content
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createDatabase, sql, type Database } from '@framework/db'
import { requestWithHost, startBuiltServer } from './lib/built-server.mjs'

const env = process.env
const port = env['GATE_CONTENT_PORT'] ?? '3995'
const adminHost = env['ADMIN_HOST']
const password = env['ADMIN_PASSWORD']
const mediaDir = env['MEDIA_DIR']
const agentUser = env['AGENT_DB_USER'] ?? 'blog_agent'
const siteCode = 'dapur-nusantara'
const siteHost = env['GATE_CONTENT_SITE_HOST'] ?? 'kuliner.localhost'

if (!adminHost || !password || !env['ADMIN_SESSION_SECRET'] || !mediaDir) {
  console.error('[gate-content] ADMIN_HOST, ADMIN_SESSION_SECRET, ADMIN_PASSWORD, dan MEDIA_DIR wajib diisi')
  process.exit(1)
}

const ownerUrl = () => {
  const user = env['PGUSER'] ?? env['POSTGRES_USER']
  const pass = env['PGPASSWORD'] ?? env['POSTGRES_PASSWORD']
  const db = env['PGDATABASE'] ?? env['POSTGRES_DB']
  const host = env['PGHOST'] ?? 'localhost'
  const dbPort = env['PGPORT'] ?? env['POSTGRES_PORT'] ?? '5432'
  if (!user || !pass || !db) throw new Error('tanpa AGENT_DATABASE_URL, isi POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB (pemilik schema)')
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${dbPort}/${db}`
}

const direct = Boolean(env['AGENT_DATABASE_URL'])
const agentDb: Database = createDatabase({ connectionString: env['AGENT_DATABASE_URL'] ?? ownerUrl(), max: 1, applicationName: 'gate-content' })

/** Jalankan SQL sebagai agent, dalam transaksi; `rollback` = jangan simpan. */
async function asAgent<T>(run: (tx: Database) => Promise<T>, { rollback = false } = {}): Promise<T> {
  const ROLLBACK = Symbol('rollback')
  let result: T | undefined
  try {
    await agentDb.transaction(async (tx) => {
      if (!direct) await tx.execute(sql.raw(`SET LOCAL ROLE "${agentUser.replace(/"/g, '""')}"`))
      result = await run(tx as unknown as Database)
      if (rollback) throw ROLLBACK
    })
  } catch (error) {
    if (error !== ROLLBACK) throw error
  }
  return result as T
}

/** Kode SQLSTATE dari galat pg (juga yang dibungkus Drizzle). */
async function sqlState(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run()
    return null
  } catch (error) {
    for (let e: unknown = error; e; e = (e as { cause?: unknown }).cause) {
      const code = (e as { code?: unknown }).code
      if (typeof code === 'string') return code
    }
    return 'unknown'
  }
}

const failures: string[] = []
let passed = 0
function check(label: string, condition: boolean, detail = '') {
  if (condition) passed++
  else failures.push(`${label}${detail ? `: ${detail}` : ''}`)
}

const adminOrigin = `http://${adminHost}:${port}`
function admin(path: string, { method = 'GET', body, cookie }: { method?: string; body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = {}
  if (method !== 'GET') headers['origin'] = adminOrigin
  if (cookie) headers['cookie'] = cookie
  return requestWithHost(port, { method, path, host: `${adminHost}:${port}`, headers, body })
}
const site = (path: string) => requestWithHost(port, { path, host: siteHost })
const json = (body: string) => JSON.parse(body) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/** PNG minimal yang lolos pemeriksaan isi gambar (signature + IHDR). */
function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  new DataView(b.buffer).setUint32(16, width)
  new DataView(b.buffer).setUint32(20, height)
  return b
}

const run = `${Date.now().toString(36)}${process.pid}`
const slug = `gate-konten-${run}`
const marker = `penandagate${run}`
const storageKey = `${siteCode}/gate/${run}.png`
const video = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
const payload = {
  version: 1,
  title: `Gate konten ${run}`,
  slug,
  excerpt: 'Hasil AI uji gate.',
  category: 'resep',
  author: 'redaksi',
  tags: ['Pedas'],
  cover: 'sampul',
  images: [{ key: 'sampul', storageKey, altText: 'Gambar uji', credit: 'Foto: Gate', sourceUrl: 'https://contoh.test/gate/foto' }],
  body: { version: 1, blocks: [{ type: 'paragraph', text: `Isi uji ${marker}.` }, { type: 'embed', provider: 'youtube', url: video }] },
  references: [
    { title: `Sumber gate ${run}`, url: `https://contoh.test/gate/${run}`, publisher: 'Contoh' },
    { title: 'Video sumber', url: video, publisher: 'YouTube', kind: 'VIDEO' },
  ],
}

const server = await startBuiltServer({ port, label: 'gate-content' })
let articleToArchive: { siteId: string; id: string; cookie: string } | null = null
try {
  if (server.response?.status !== 200) throw new Error(`server/database tidak siap (${server.healthUrl} -> ${server.response?.status ?? 'tidak menjawab'})`)

  // ---- Agent menulis hasil AI -----------------------------------------
  const file = join(mediaDir, ...storageKey.split('/'))
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, png(1200, 630))

  const who = await asAgent(async (tx) => (await tx.execute<{ u: string }>(sql`SELECT current_user AS u`)).rows[0]?.u)
  check('koneksi agent memakai role agent', who === agentUser, String(who))
  const [siteRow] = (await asAgent((tx) => tx.execute<{ id: string }>(sql`SELECT id FROM sites WHERE code = ${siteCode}`))).rows
  if (!siteRow) throw new Error(`site ${siteCode} tidak ada (database belum di-seed?)`)
  const siteId = siteRow.id

  const ids = await asAgent(async (tx) => {
    const insert = (externalId: string, p: unknown) =>
      tx.execute<{ id: string }>(sql`
        INSERT INTO generated_articles (site_id, external_id, payload, agent_note)
        VALUES (${siteId}, ${externalId}, ${JSON.stringify(p)}::jsonb, 'catatan gate')
        RETURNING id`)
    const valid = (await insert(`gate/${run}/valid`, payload)).rows[0]?.id
    const broken = (await insert(`gate/${run}/rusak`, { ...payload, slug: `${slug}-rusak`, category: 'tidak-ada' })).rows[0]?.id
    return { valid: valid ?? '', broken: broken ?? '' }
  })
  check('agent menulis hasil AI', Boolean(ids.valid && ids.broken))

  const denied = (state: string | null) => state === '42501'
  check('agent tidak bisa menulis articles', denied(await sqlState(() => asAgent((tx) => tx.execute(sql`
    INSERT INTO articles (site_id, category_id, title, slug) SELECT ${siteId}, id, 'x', ${`${slug}-langsung`} FROM categories WHERE site_id = ${siteId} LIMIT 1`), { rollback: true }))))
  check('agent tidak bisa mengisi status', denied(await sqlState(() => asAgent((tx) => tx.execute(sql`
    INSERT INTO generated_articles (site_id, external_id, payload, status) VALUES (${siteId}, ${`gate/${run}/status`}, '{}', 'APPROVED')`), { rollback: true }))))
  check('agent tidak bisa menyetujui sendiri', denied(await sqlState(() => asAgent((tx) => tx.execute(sql`
    UPDATE generated_articles SET status = 'APPROVED', reviewed_at = now() WHERE id = ${ids.valid}`), { rollback: true }))))

  // ---- Belum tampil di web ----------------------------------------------
  const articlePath = `/resep/${slug}`
  const publicState = async () => {
    const [page, home, sitemap, rss, search] = await Promise.all([site(articlePath), site('/'), site('/sitemap.xml'), site('/rss.xml'), site(`/search?q=${marker}`)])
    return { page: page.status, home: home.body.includes(slug), sitemap: sitemap.body.includes(slug), rss: rss.body.includes(slug), search: search.body.includes(slug), html: page.body }
  }
  const before = await publicState()
  check('sebelum approve: URL artikel 404', before.page === 404, String(before.page))
  check('sebelum approve: tidak ada di home, sitemap, RSS, pencarian', !before.home && !before.sitemap && !before.rss && !before.search, JSON.stringify({ ...before, html: undefined }))

  // ---- Admin memutuskan ------------------------------------------------
  const login = await admin('/api/admin/login', { method: 'POST', body: { email: env['ADMIN_EMAIL'] ?? 'admin@local.test', password } })
  const cookie = [login.headers['set-cookie'] ?? []].flat().find((c) => c.startsWith('blog_admin='))?.split(';')[0] ?? ''
  check('login admin', login.status === 200 && Boolean(cookie), String(login.status))

  let r = await admin('/api/admin/generated', { cookie })
  check('antrian memuat kedua hasil AI', r.status === 200 && [ids.valid, ids.broken].every((id) => r.body.includes(id)), String(r.status))

  const base = `/api/admin/sites/${siteId}/generated`
  r = await admin(`${base}/${ids.broken}`, { cookie })
  const broken = json(r.body)
  check('hasil rusak: pemeriksaan memblokir', r.status === 200 && broken['canApprove'] === false && JSON.stringify(broken['issues']).includes('category'), r.body.slice(0, 200))
  r = await admin(`${base}/${ids.broken}/approve`, { method: 'POST', cookie, body: { mode: 'publish', expectedUpdatedAt: broken['record']?.updatedAt } })
  check('hasil rusak tidak bisa di-approve (422)', r.status === 422, String(r.status))
  r = await admin(`${base}/${ids.broken}/reject`, { method: 'POST', cookie, body: { note: 'Kategori tidak ada (gate)', expectedUpdatedAt: broken['record']?.updatedAt } })
  check('tolak: ARCHIVED dengan alasan', r.status === 200 && json(r.body)['status'] === 'ARCHIVED', `${r.status} ${r.body.slice(0, 120)}`)

  r = await admin(`${base}/${ids.valid}`, { cookie })
  const valid = json(r.body)
  check('hasil valid: bisa di-approve', valid['canApprove'] === true, JSON.stringify(valid['issues']))
  r = await admin(`/admin/preview/${siteCode}/?generated=${ids.valid}`, { cookie })
  check('pratinjau: artikel dengan referensi, noindex', r.status === 200 && r.body.includes(`Gate konten ${run}`) && r.body.includes('Sumber dan referensi') && String(r.headers['x-robots-tag']).includes('noindex'), String(r.status))
  r = await admin(`${base}/${ids.valid}/approve`, { method: 'POST', cookie, body: { mode: 'publish', expectedUpdatedAt: valid['record']?.updatedAt } })
  const approved = json(r.body)
  check('approve: artikel terbit dari hasil AI', r.status === 200 && approved['article']?.status === 'PUBLISHED' && approved['generated']?.status === 'APPROVED', `${r.status} ${r.body.slice(0, 200)}`)
  if (approved['article']?.id) articleToArchive = { siteId, id: approved['article'].id, cookie }

  // ---- Tampil di web, dengan sumbernya ----------------------------------
  const after = await publicState()
  check('setelah approve: URL artikel 200', after.page === 200, String(after.page))
  check('setelah approve: ada di home, sitemap, RSS, pencarian', after.home && after.sitemap && after.rss && after.search, JSON.stringify({ ...after, html: undefined }))
  check('halaman: bagian referensi berurutan', after.html.includes('Sumber dan referensi') && after.html.indexOf(`Sumber gate ${run}`) < after.html.indexOf('Video sumber'))
  check('halaman: sumber gambar dan sumber video', after.html.includes('https://contoh.test/gate/foto') && after.html.includes('Tonton di sumber asli'))
  check('halaman: JSON-LD citation', /application\/ld\+json[^>]*>[^<]*"citation":\[/.test(after.html) && after.html.includes(`https://contoh.test/gate/${run}`))

  check('agent tidak bisa mengubah hasil yang sudah diputuskan', (await sqlState(() => asAgent((tx) => tx.execute(sql`
    UPDATE generated_articles SET payload = '{"version": 1}' WHERE id = ${ids.valid}`), { rollback: true }))) === 'P0001')
} catch (error) {
  failures.push(`galat: ${(error as Error).message}`)
} finally {
  if (articleToArchive) {
    const { siteId, id, cookie } = articleToArchive
    const r = await admin(`/api/admin/sites/${siteId}/articles/${id}/archive`, { method: 'POST', cookie, body: { version: 1 } })
    if (r.status !== 200) failures.push(`arsip artikel uji gagal: ${r.status}`)
  }
  await agentDb.$client.end()
  await server.stop()
}

if (failures.length) {
  console.error(`[gate-content] GAGAL (${failures.length}):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log(`[gate-content] OK: ${passed} pemeriksaan konten AI lulus`)
