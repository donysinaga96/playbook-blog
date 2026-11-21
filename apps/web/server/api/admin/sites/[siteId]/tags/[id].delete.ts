// DELETE ?updatedAt=: hapus tag (lepas dari artikel dan menu).
import { getQuery } from 'nuxt/server'
import { defineAdminSiteHandler, param } from '../../../../../utils/admin-api'

export default defineAdminSiteHandler(async ({ editor, site, event }) => {
  await editor.deleteTag(site.id, param(event, 'id'), String(getQuery(event)['updatedAt'] ?? ''))
  return { ok: true }
})
