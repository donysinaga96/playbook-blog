// Menjalankan server hasil build (.output/server/index.mjs) untuk script
// pemeriksaan (smoke-build, gate-parallel), lalu menghentikannya.
import { spawn } from 'node:child_process'
import { request } from 'node:http'
import { fileURLToPath } from 'node:url'

const entry = fileURLToPath(new URL('../../.output/server/index.mjs', import.meta.url))

/**
 * Start server di port tertentu dan tunggu sampai /api/health menjawab
 * (status apa pun). `response` undefined bila tidak menjawab dalam batas waktu
 * atau server berhenti sendiri.
 */
export async function startBuiltServer({ port, label, timeoutMs = 30_000 }) {
  const server = spawn(process.execPath, [entry], {
    env: { ...process.env, PORT: port, HOST: '127.0.0.1' },
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  let exited = false
  let stopping = false
  server.on('exit', (code) => {
    exited = true
    if (!stopping) console.error(`[${label}] server berhenti sendiri (exit ${code})`)
  })

  const healthUrl = `http://127.0.0.1:${port}/api/health`
  const deadline = Date.now() + timeoutMs
  let response
  while (Date.now() < deadline && !exited) {
    try {
      response = await fetch(healthUrl)
      break
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }

  return {
    healthUrl,
    response,
    stop() {
      stopping = true
      if (!exited) server.kill('SIGTERM')
    },
  }
}

/** GET dengan header Host tertentu; fetch() tidak mengizinkan header Host. */
export function getWithHost(port, path, host) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, headers: { host } }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

/**
 * Request apa pun dengan header Host tertentu. `body` object dikirim sebagai
 * JSON. Mengembalikan status, header (huruf kecil), dan body teks.
 */
export function requestWithHost(port, { method = 'GET', path, host, headers = {}, body }) {
  const payload = body === undefined ? undefined : JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers: { host, ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}), ...headers },
      },
      (res) => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => { text += chunk })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }))
      },
    )
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}
