// Smoke test hasil build: jalankan .output/server/index.mjs, panggil
// /api/health, lalu cocokkan status HTTP dengan yang diharapkan.
//
//   node scripts/smoke-build.mjs          -> harus 200 (database hidup)
//   EXPECT_STATUS=503 node scripts/...    -> database sengaja tidak ada (CI)
//   SMOKE_HOSTS=a.test,b.test node ...    -> juga render halaman / tiap domain
//
// 503 tetap membuktikan bundle bisa start, route ikut ter-build, dan
// driver pg ikut terbawa: tanpa pg, server crash dan status tidak pernah 503.
//
// SMOKE_HOSTS (butuh database ber-seed) memeriksa render SSR halaman: status
// 200 dan wrapper template (class="tpl ..."). Ini menangkap bug yang hanya
// muncul di bundle produksi, mis. driver database ikut ter-bundle ke SSR Vue.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const port = process.env.SMOKE_PORT ?? '3999'
const expected = Number(process.env.EXPECT_STATUS ?? '200')
const timeoutMs = 30_000
const entry = fileURLToPath(new URL('../.output/server/index.mjs', import.meta.url))
const url = `http://127.0.0.1:${port}/api/health`
const pageHosts = (process.env.SMOKE_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean)

const server = spawn(process.execPath, [entry], {
  env: { ...process.env, PORT: port, HOST: '127.0.0.1' },
  stdio: ['ignore', 'inherit', 'inherit'],
})

let exited = false
let stopping = false
server.on('exit', (code) => {
  exited = true
  if (!stopping) console.error(`[smoke] server berhenti sendiri (exit ${code})`)
})

async function waitForResponse() {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline && !exited) {
    try {
      return await fetch(url)
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  return undefined
}

let failed = true
try {
  const response = await waitForResponse()
  if (!response) {
    console.error(`[smoke] GAGAL: ${url} tidak menjawab dalam ${timeoutMs / 1000} detik`)
  } else {
    const body = await response.text()
    console.log(`[smoke] ${url} -> ${response.status} ${body}`)
    if (response.status !== expected) {
      console.error(`[smoke] GAGAL: status ${response.status}, seharusnya ${expected}`)
    } else if (!body.includes('"status"')) {
      console.error('[smoke] GAGAL: body bukan respons health check')
    } else {
      failed = !(await checkPages())
      if (!failed) console.log('[smoke] OK')
    }
  }
} finally {
  stopping = true
  if (!exited) server.kill('SIGTERM')
}
process.exitCode = failed ? 1 : 0

/** Render halaman / untuk setiap domain di SMOKE_HOSTS. */
async function checkPages() {
  let ok = true
  for (const host of pageHosts) {
    const target = `http://127.0.0.1:${port}/`
    // fetch() tidak mengizinkan header Host; pakai node:http.
    const { status, body } = await getWithHost(target, host)
    const wrapper = body.match(/class="tpl [^"]*"/)?.[0]
    console.log(`[smoke] ${host}/ -> ${status} ${wrapper ?? '(tanpa wrapper template)'}`)
    if (status !== 200 || !wrapper) {
      console.error(`[smoke] GAGAL: halaman ${host} harus 200 dengan wrapper template`)
      ok = false
    }
  }
  return ok
}

async function getWithHost(target, host) {
  const { request } = await import('node:http')
  return new Promise((resolve, reject) => {
    const req = request(target, { headers: { host } }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
    })
    req.on('error', reject)
    req.end()
  })
}
