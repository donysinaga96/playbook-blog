// POST: tambah item menu.
import { readBody } from 'nuxt/server'
import { defineAdminSiteHandler, param } from '../../../../../../../utils/admin-api'

export default defineAdminSiteHandler(async ({ editor, site, event }) =>
  editor.createMenuItem(site.id, param(event, 'location'), await readBody(event)))
