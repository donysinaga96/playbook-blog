// GET: daftar revisi artikel, terbaru dulu.
import { defineAdminSiteHandler, param } from '../../../../../../utils/admin-api'

export default defineAdminSiteHandler(({ editor, site, event }) => editor.listRevisions(site.id, param(event, 'id')))
