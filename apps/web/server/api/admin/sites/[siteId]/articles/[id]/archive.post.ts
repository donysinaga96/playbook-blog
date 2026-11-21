// POST { version }: arsipkan artikel (tidak tampil publik).
import { readBody } from 'nuxt/server'
import { defineAdminSiteHandler, param } from '../../../../../../utils/admin-api'

export default defineAdminSiteHandler(async ({ editor, site, admin, event }) => {
  const body = (await readBody(event)) as { version?: number } | null
  return editor.archiveArticle(site.id, param(event, 'id'), Number(body?.version), admin.user.id)
})
