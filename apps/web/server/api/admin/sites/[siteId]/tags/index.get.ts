// GET: semua tag site.
import { defineAdminSiteHandler } from '../../../../../utils/admin-api'

export default defineAdminSiteHandler(({ editor, site }) => editor.listTags(site.id))
