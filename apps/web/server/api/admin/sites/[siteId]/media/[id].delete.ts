// DELETE ?updatedAt=: hapus media yang tidak dipakai, beserta file-nya.
import { getQuery } from 'nuxt/server'
import { defineAdminSiteHandler, param } from '../../../../../utils/admin-api'
import { useMediaStorage } from '../../../../../utils/media'

export default defineAdminSiteHandler(async ({ editor, site, event }) => {
  const { storageKey } = await editor.deleteMedia(site.id, param(event, 'id'), String(getQuery(event)['updatedAt'] ?? ''))
  await useMediaStorage()?.delete(storageKey)
  return { ok: true }
})
