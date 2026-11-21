// GET: menu di lokasi (header, footer, ...) beserta semua itemnya.
import { defineAdminSiteHandler, param } from '../../../../../utils/admin-api'

export default defineAdminSiteHandler(({ editor, site, event }) => editor.getMenu(site.id, param(event, 'location')))
