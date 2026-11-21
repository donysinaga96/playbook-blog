// PUT { media, updatedAt }: ubah alt, keterangan, kredit, titik fokus.
import { readBody } from 'nuxt/server'
import { defineAdminSiteHandler, param } from '../../../../../utils/admin-api'

export default defineAdminSiteHandler(async ({ editor, site, event }) => {
  const body = (await readBody(event)) as { media?: unknown; updatedAt?: string } | null
  return editor.updateMedia(site.id, param(event, 'id'), body?.media, String(body?.updatedAt ?? ''))
})
