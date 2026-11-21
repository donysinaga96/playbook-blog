// PUT { item, updatedAt }: simpan item menu.
import { readBody } from 'nuxt/server'
import { defineAdminSiteHandler, param } from '../../../../../../../utils/admin-api'

export default defineAdminSiteHandler(async ({ editor, site, event }) => {
  const body = (await readBody(event)) as { item?: unknown; updatedAt?: string } | null
  return editor.updateMenuItem(site.id, param(event, 'location'), param(event, 'id'), body?.item, String(body?.updatedAt ?? ''))
})
