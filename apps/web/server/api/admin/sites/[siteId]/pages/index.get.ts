// GET: semua halaman statis site.
import { defineAdminSiteHandler } from '../../../../../utils/admin-api'

export default defineAdminSiteHandler(({ editor, site }) => editor.listPages(site.id))
