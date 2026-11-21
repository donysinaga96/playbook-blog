// PUT { page, updatedAt }: simpan halaman; updatedAt berbeda -> 409.
import { readBody } from 'nuxt/server'
import { defineAdminSiteHandler, param } from '../../../../../utils/admin-api'

export default defineAdminSiteHandler(async ({ editor, site, event }) => {
  const body = (await readBody(event)) as { page?: unknown; updatedAt?: string } | null
  return editor.updatePage(site.id, param(event, 'id'), body?.page, String(body?.updatedAt ?? ''))
})
