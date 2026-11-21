// POST: buat tag.
import { readBody } from 'nuxt/server'
import { defineAdminSiteHandler } from '../../../../../utils/admin-api'

export default defineAdminSiteHandler(async ({ editor, site, event }) => editor.createTag(site.id, await readBody(event)))
