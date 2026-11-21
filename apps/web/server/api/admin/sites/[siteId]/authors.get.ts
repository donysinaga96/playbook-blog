// GET: penulis site untuk pilihan di form artikel.
import { defineAdminSiteHandler } from '../../../../utils/admin-api'

export default defineAdminSiteHandler(({ editor, site }) => editor.listAuthors(site.id))
