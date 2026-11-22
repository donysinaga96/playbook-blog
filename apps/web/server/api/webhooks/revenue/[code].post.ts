// POST /api/webhooks/revenue/:code  -  webhook pembayaran (Lynk.id).
//
// Publik (tanpa sesi admin), tidak bergantung Host (middleware site
// melewatinya), aman karena tanda tangan X-Lynk-Signature diverifikasi
// dengan merchant key dari env. Body dibaca mentah dengan batas ukuran.
// Balasan cepat: 200 untuk event yang diterima (termasuk duplikat), 401
// tanda tangan salah, 503 bila merchant key belum dipasang (agar dikirim ulang).
import { MAX_WEBHOOK_BYTES } from '@framework/core'
import { createError, defineEventHandler, getRouterParam, setResponseStatus } from 'nuxt/server'
import { log } from '../../../utils/log'
import { useRevenueService } from '../../../utils/revenue'

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code') ?? ''
  if (!/^[a-z0-9_]{1,40}$/.test(code)) throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  event.res.headers.set('cache-control', 'no-store')
  const length = Number(event.req.headers.get('content-length') ?? 0)
  if (length > MAX_WEBHOOK_BYTES) throw createError({ statusCode: 413, statusMessage: 'Payload Too Large' })
  const raw = await event.req.text()
  const headers: Record<string, string> = {}
  event.req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value
  })
  const result = await useRevenueService().handleWebhook(code, raw, headers)
  if (result.status >= 400) log('warn', 'webhook pendapatan ditolak', { source: code, status: result.status, reason: result.body.message })
  setResponseStatus(event, result.status)
  return result.body
})
