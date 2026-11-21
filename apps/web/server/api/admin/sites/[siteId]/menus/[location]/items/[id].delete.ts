// DELETE ?updatedAt=: hapus item menu beserta sub-itemnya.
import { getQuery } from 'nuxt/server'
import { defineAdminSiteHandler, param } from '../../../../../../../utils/admin-api'

export default defineAdminSiteHandler(async ({ editor, site, event }) => {
  await editor.deleteMenuItem(site.id, param(event, 'location'), param(event, 'id'), String(getQuery(event)['updatedAt'] ?? ''))
  return { ok: true }
})
