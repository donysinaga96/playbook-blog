// PUT { category, updatedAt, status? }: simpan kategori; status ACTIVE/HIDDEN opsional.
import { readBody } from 'nuxt/server'
import { defineAdminSiteHandler, param } from '../../../../../utils/admin-api'

export default defineAdminSiteHandler(async ({ editor, site, event }) => {
  const body = (await readBody(event)) as { category?: unknown; updatedAt?: string; status?: string } | null
  const status = body?.status === 'ACTIVE' || body?.status === 'HIDDEN' ? body.status : undefined
  return editor.updateCategory(site.id, param(event, 'id'), body?.category, String(body?.updatedAt ?? ''), status)
})
