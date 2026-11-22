// DELETE ?updatedAt=: hapus media yang tidak dipakai, beserta file-nya.
import { getQuery } from 'nuxt/server'
import { defineAdminSiteHandler, param } from '../../../../../utils/admin-api'
import { useMediaStorage } from '../../../../../utils/media'
import { log } from '../../../../../utils/log'

export default defineAdminSiteHandler(async ({ editor, site, event }) => {
  const { storageKey } = await editor.deleteMedia(site.id, param(event, 'id'), String(getQuery(event)['updatedAt'] ?? ''))
  // Baris sudah terhapus: galat hapus file hanya dicatat. Melempar di sini
  // membuat admin melihat galat, lalu 404 saat mencoba lagi.
  try {
    await useMediaStorage()?.delete(storageKey)
  } catch (error) {
    log('error', 'media: file gagal dihapus (catatan sudah terhapus)', { storageKey, error })
  }
  return { ok: true }
})
