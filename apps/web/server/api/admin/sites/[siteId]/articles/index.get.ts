// GET ?page=&status=&q=: daftar artikel admin (termasuk draf dan arsip).
import { getQuery } from 'nuxt/server'
import { defineAdminSiteHandler } from '../../../../../utils/admin-api'

export default defineAdminSiteHandler(({ editor, site, event }) => {
  const q = getQuery(event)
  return editor.listArticles(site.id, {
    page: Number(q['page']) || 1,
    status: typeof q['status'] === 'string' && q['status'] ? q['status'] : undefined,
    q: typeof q['q'] === 'string' ? q['q'] : undefined,
  })
})
