// GET /media/<storage_key>: file media milik site request ini.
//
//  - storage_key wajib diawali kode site, jadi gambar site lain tidak bisa
//    diambil lewat domain ini.
//  - Path dicek ketat (splitStorageKey) agar tidak bisa keluar dari MEDIA_DIR.
//  - Di dev, file yang tidak ada diganti placeholder SVG (utils/media.ts).
import { splitStorageKey } from '@framework/core'
import { defineEventHandler, getRouterParam, setResponseStatus } from 'nuxt/server'
import { mediaSecurityHeaders, readMediaFile } from '../../utils/media'

export default defineEventHandler(async (event) => {
  const site = event.context.site
  const key = decodeURIComponent(getRouterParam(event, 'key') ?? '')
  const segments = splitStorageKey(key)
  if (!site || !segments || segments[0] !== site.code) return notFound(event)

  const file = await readMediaFile(key)
  if (!file) return notFound(event)
  mediaSecurityHeaders(event.res.headers)
  event.res.headers.set('content-type', file.contentType)
  event.res.headers.set('cache-control', file.placeholder ? 'no-store' : 'public, max-age=86400')
  return file.data
})

function notFound(event: Parameters<typeof setResponseStatus>[0]) {
  setResponseStatus(event, 404)
  event.res.headers.set('content-type', 'text/plain; charset=utf-8')
  return 'Media tidak ditemukan.\n'
}
