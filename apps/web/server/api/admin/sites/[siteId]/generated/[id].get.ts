// GET: satu hasil AI dengan hasil pemeriksaan (galat/peringatan) dan payload
// mentah, untuk layar approval. Pratinjau: /admin/preview/<kode>/?generated=<id>.
import { defineAdminSiteHandler, param } from '../../../../../utils/admin-api'
import { useRepositories } from '../../../../../utils/database'
import { useMediaStorage } from '../../../../../utils/media'

export default defineAdminSiteHandler(async ({ site, event }) => {
  const id = param(event, 'id')
  const review = await useRepositories().generated.review(site.id, id, useMediaStorage())
  return {
    record: review.record,
    issues: review.issues,
    canApprove: review.canApprove,
    previewPath: `/admin/preview/${site.code}/?generated=${encodeURIComponent(review.record.id)}`,
  }
})
