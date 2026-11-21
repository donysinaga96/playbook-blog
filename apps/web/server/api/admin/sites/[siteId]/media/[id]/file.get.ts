// GET: isi file media untuk pratinjau di admin. Route publik /media hanya
// melayani domain site, sedangkan admin ada di host admin (ADR-009).
import { createError } from 'nuxt/server'
import { defineAdminSiteHandler, param } from '../../../../../../utils/admin-api'
import { mediaSecurityHeaders, readMediaFile } from '../../../../../../utils/media'

export default defineAdminSiteHandler(async ({ editor, site, event }) => {
  const [item] = (await editor.listMedia(site.id, { ids: [param(event, 'id')] })).items
  const file = item ? await readMediaFile(item.storageKey) : null
  if (!file) throw createError({ statusCode: 404, statusMessage: 'Media tidak ditemukan' })
  mediaSecurityHeaders(event.res.headers)
  event.res.headers.set('content-type', file.contentType)
  // Admin saja dan bisa dihapus kapan pun: simpan di browser, jangan di proxy.
  event.res.headers.set('cache-control', file.placeholder ? 'no-store' : 'private, max-age=3600')
  return file.data
})
