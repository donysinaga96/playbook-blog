// GET: pengaturan site (nama, tagline, logo, favicon, SEO bawaan, permalink baca-saja).
import { defineAdminSiteHandler } from '../../../../utils/admin-api'

export default defineAdminSiteHandler(({ editor, site }) => editor.getSiteSettings(site.id))
