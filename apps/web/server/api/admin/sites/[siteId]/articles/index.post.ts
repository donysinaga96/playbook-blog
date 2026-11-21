// POST: buat artikel; body = input artikel (divalidasi core).
import { readBody } from 'nuxt/server'
import { defineAdminSiteHandler } from '../../../../../utils/admin-api'

export default defineAdminSiteHandler(async ({ editor, site, admin, event }) =>
  editor.createArticle(site.id, await readBody(event), admin.user.id))
