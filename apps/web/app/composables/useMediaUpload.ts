// Unggah gambar ke /api/admin/sites/:siteId/media (multipart). Batas dan
// tipe file diperiksa server; pengecekan di sini hanya agar pesan cepat.
import type { MediaListItem } from '@framework/core'

export const UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp'
export const UPLOAD_MAX_MB = 10

export async function uploadMedia(siteId: string, file: File, meta: { altText: string; caption?: string; credit?: string }): Promise<Json<MediaListItem>> {
  if (file.size > UPLOAD_MAX_MB * 1024 * 1024) throw new Error(`File terlalu besar (maks. ${UPLOAD_MAX_MB} MB)`)
  const form = new FormData()
  form.append('file', file)
  form.append('altText', meta.altText)
  if (meta.caption) form.append('caption', meta.caption)
  if (meta.credit) form.append('credit', meta.credit)
  return adminApi<Json<MediaListItem>>(siteId, 'media', { method: 'POST', body: form })
}

/** URL pratinjau di host admin (route publik /media hanya di domain site). */
export const mediaFileUrl = (siteId: string, mediaId: string) => `/api/admin/sites/${siteId}/media/${mediaId}/file`

export const mediaName = (m: { storageKey: string }) => m.storageKey.split('/').at(-1) ?? m.storageKey
