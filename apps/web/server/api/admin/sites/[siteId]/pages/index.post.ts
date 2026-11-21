// POST: buat halaman; body = input halaman.
import { readBody } from 'nuxt/server'
import { defineAdminSiteHandler } from '../../../../../utils/admin-api'

export default defineAdminSiteHandler(async ({ editor, site, event }) => editor.createPage(site.id, await readBody(event)))
