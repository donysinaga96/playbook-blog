// PUT { article, version, changeNote? }: simpan seluruh isi artikel.
// version = versi yang dibaca saat form dibuka; berbeda -> 409.
import { readBody } from 'nuxt/server'
import { defineAdminSiteHandler, param } from '../../../../../utils/admin-api'

export default defineAdminSiteHandler(async ({ editor, site, admin, event }) => {
  const body = (await readBody(event)) as { article?: unknown; version?: number; changeNote?: string } | null
  return editor.updateArticle(site.id, param(event, 'id'), body?.article, Number(body?.version), admin.user.id, body?.changeNote)
})
