// GET /admin/preview-media/<storage_key>: file media untuk pratinjau tema.
// Route publik /media hanya melayani domain site, sedangkan pratinjau ada di
// host admin. Wajib sesi admin; kode site di awal key harus site milik user.
import { splitStorageKey } from '@framework/core'
import { defineEventHandler, setResponseStatus, type RequestEvent } from 'nuxt/server'
import { assertAdminRequest, requireAdmin } from '../../../utils/admin'
import { mediaKeyParam, mediaSecurityHeaders, readMediaFile } from '../../../utils/media'

export default defineEventHandler(async (event) => {
  // Galat dijawab teks polos dengan status yang benar: di build produksi,
  // galat yang dilempar di path /admin/** dirender sebagai halaman SPA.
  let admin
  try {
    assertAdminRequest(event)
    admin = await requireAdmin(event)
  } catch (error) {
    return plain(event, (error as { statusCode?: number }).statusCode ?? 401, 'Tidak diizinkan.')
  }
  const key = mediaKeyParam(event)
  const segments = key === null ? null : splitStorageKey(key)
  if (key === null || !segments || !admin.sites.some((s) => s.code === segments[0])) return plain(event, 404, 'Media tidak ditemukan.')
  const file = await readMediaFile(key)
  if (!file) return plain(event, 404, 'Media tidak ditemukan.')
  mediaSecurityHeaders(event.res.headers)
  event.res.headers.set('content-type', file.contentType)
  event.res.headers.set('cache-control', 'private, no-store')
  return file.data
})

function plain(event: RequestEvent, status: number, text: string) {
  setResponseStatus(event, status)
  event.res.headers.set('content-type', 'text/plain; charset=utf-8')
  event.res.headers.set('cache-control', 'no-store')
  return `${text}\n`
}
