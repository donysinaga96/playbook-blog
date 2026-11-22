// PUT { settings, updatedAt }: simpan pengaturan site; updatedAt dari GET (409 bila berbeda).
import { readBody } from 'nuxt/server'
import { defineAdminSiteHandler } from '../../../../utils/admin-api'

export default defineAdminSiteHandler(async ({ editor, site, event }) => {
  const body = ((await readBody(event)) ?? {}) as { settings?: unknown; updatedAt?: unknown }
  return editor.updateSiteSettings(site.id, body.settings, String(body.updatedAt ?? ''))
})
