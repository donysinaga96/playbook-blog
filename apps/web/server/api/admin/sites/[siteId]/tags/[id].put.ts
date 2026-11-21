// PUT { tag, updatedAt }: simpan tag.
import { readBody } from 'nuxt/server'
import { defineAdminSiteHandler, param } from '../../../../../utils/admin-api'

export default defineAdminSiteHandler(async ({ editor, site, event }) => {
  const body = (await readBody(event)) as { tag?: unknown; updatedAt?: string } | null
  return editor.updateTag(site.id, param(event, 'id'), body?.tag, String(body?.updatedAt ?? ''))
})
