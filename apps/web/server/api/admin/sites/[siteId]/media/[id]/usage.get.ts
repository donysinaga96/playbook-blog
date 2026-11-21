// GET: tempat media dipakai (kosong = boleh dihapus).
import { defineAdminSiteHandler, param } from '../../../../../../utils/admin-api'

export default defineAdminSiteHandler(({ editor, site, event }) => editor.mediaUsage(site.id, param(event, 'id')))
