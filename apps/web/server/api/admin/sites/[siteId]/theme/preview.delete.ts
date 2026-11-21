// DELETE ?draftId=: buang draf pratinjau (halaman tema ditinggalkan).
import { getQuery } from 'nuxt/server'
import { defineAdminSiteHandler } from '../../../../../utils/admin-api'
import { deletePreviewDraft } from '../../../../../utils/preview-drafts'

export default defineAdminSiteHandler(async ({ event, admin }) => {
  const id = getQuery(event)['draftId']
  if (typeof id === 'string') deletePreviewDraft(id, admin.user.id)
  return { ok: true }
})
