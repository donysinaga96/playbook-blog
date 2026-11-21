// GET: semua kategori site (ACTIVE dan HIDDEN).
import { defineAdminSiteHandler } from '../../../../../utils/admin-api'

export default defineAdminSiteHandler(({ editor, site }) => editor.listCategories(site.id))
