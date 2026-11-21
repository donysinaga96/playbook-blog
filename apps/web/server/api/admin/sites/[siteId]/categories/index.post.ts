// POST: buat kategori.
import { readBody } from 'nuxt/server'
import { defineAdminSiteHandler } from '../../../../../utils/admin-api'

export default defineAdminSiteHandler(async ({ editor, site, event }) => editor.createCategory(site.id, await readBody(event)))
