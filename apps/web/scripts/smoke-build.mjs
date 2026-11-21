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
// Format host[=template], mis. tekno.localhost=magazine: bila template
// disebut, wrapper wajib class="tpl tpl-<template>" (template tidak jatuh
// diam-diam ke base).
import { getWithHost, startBuiltServer } from './lib/built-server.mjs'

const port = process.env.SMOKE_PORT ?? '3999'
const expected = Number(process.env.EXPECT_STATUS ?? '200')
const pageHosts = (process.env.SMOKE_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean).map((entry) => {
  const [host, template] = entry.split('=')
  return { host, template }
})

const server = await startBuiltServer({ port, label: 'smoke' })
let failed = true
try {
  const { response, healthUrl } = server
  if (!response) {
    console.error(`[smoke] GAGAL: ${healthUrl} tidak menjawab`)
  } else {
    const body = await response.text()
    console.log(`[smoke] ${healthUrl} -> ${response.status} ${body}`)
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
  server.stop()
}
process.exitCode = failed ? 1 : 0

/** Render halaman / untuk setiap domain di SMOKE_HOSTS. */
async function checkPages() {
  let ok = true
  for (const { host, template } of pageHosts) {
    const { status, body } = await getWithHost(port, '/', host)
    const wrapper = body.match(/class="tpl [^"]*"/)?.[0]
    console.log(`[smoke] ${host}/ -> ${status} ${wrapper ?? '(tanpa wrapper template)'}`)
    if (status !== 200 || !wrapper) {
      console.error(`[smoke] GAGAL: halaman ${host} harus 200 dengan wrapper template`)
      ok = false
    } else if (template && wrapper !== `class="tpl tpl-${template}"`) {
      console.error(`[smoke] GAGAL: ${host} harus memakai template ${template}`)
      ok = false
    }
  }
  return ok
}
