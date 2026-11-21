// GET: satu artikel untuk form (semua status).
import { defineAdminSiteHandler, param } from '../../../../../utils/admin-api'

export default defineAdminSiteHandler(({ editor, site, event }) => editor.getArticle(site.id, param(event, 'id')))
