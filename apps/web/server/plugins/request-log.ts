// Log per request (M5 5.5): request id, site, method, host, path, status,
// durasi. Request id dari header x-request-id bila TRUST_PROXY=true dan
// bentuknya wajar (proxy kita yang mengisinya), selain itu dibuat baru; selalu
// dikirim balik sebagai header x-request-id.
//
// Yang tidak dicatat: query string (bisa berisi kata pencarian pembaca) dan
// /api/health yang sukses (uptime check memanggilnya terus-menerus).
// Folder plugins/ boleh memakai API Nitro (lihat site-mode.ts).
import { randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { log } from '../utils/log'

const INCOMING_ID = /^[A-Za-z0-9._-]{8,100}$/

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    const incoming = process.env['TRUST_PROXY'] === 'true' ? getRequestHeader(event, 'x-request-id') : undefined
    const id = incoming && INCOMING_ID.test(incoming) ? incoming : randomUUID()
    event.context.requestId = id
    event.context.requestStart = performance.now()
    setResponseHeader(event, 'x-request-id', id)
  })

  // Request yang berakhir dengan galat yang dilempar (401, 404, 422, 500 dari
  // createError atau exception) tidak melewati afterResponse; dicatat di sini.
  nitroApp.hooks.hook('error', (error, { event }) => {
    if (!event) return
    const status = (error as { statusCode?: number }).statusCode ?? 500
    logRequest(event, status, status >= 500 ? error : undefined)
  })

  nitroApp.hooks.hook('afterResponse', (event) => {
    logRequest(event, getResponseStatus(event))
  })
})

function logRequest(event: H3Event, status: number, error?: unknown) {
  const start = event.context.requestStart
  if (start === undefined || event.context.requestLogged) return
  event.context.requestLogged = true
  const path = event.path.split('?')[0] ?? event.path
  if (path === '/api/health' && status === 200) return
  log(status >= 500 ? 'error' : 'info', 'request', {
    id: event.context.requestId,
    site: event.context.site?.code,
    method: event.method,
    host: getRequestHost(event),
    path,
    status,
    ms: Math.round((performance.now() - start) * 10) / 10,
    error,
  })
}
