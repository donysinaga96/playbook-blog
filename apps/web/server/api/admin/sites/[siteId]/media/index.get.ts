// GET ?page= atau ?ids=a,b: media site, terbaru dulu (pemilih gambar; upload di 4.3).
import { getQuery } from 'nuxt/server'
import { defineAdminSiteHandler } from '../../../../../utils/admin-api'

export default defineAdminSiteHandler(({ editor, site, event }) => {
  const query = getQuery(event)
  const ids = typeof query['ids'] === 'string' ? query['ids'].split(',').filter(Boolean) : undefined
  return editor.listMedia(site.id, { page: Number(query['page']) || 1, ids })
})
