// POST multipart (file, altText, caption?, credit?): unggah gambar (M4 4.3).
//
//  - Ukuran dicek dari Content-Length SEBELUM body dibaca (maks. 10 MB).
//  - Tipe dan dimensi dari isi file (magic bytes): hanya JPEG, PNG, WebP.
//    Nama file dan Content-Type kiriman browser tidak dipakai.
//  - storage_key dibuat server; file dihapus lagi bila pencatatan gagal.
import { newStorageKey, sniffImage } from '@framework/core'
import { createError } from 'nuxt/server'
import { defineAdminSiteHandler } from '../../../../../utils/admin-api'
import { MAX_UPLOAD_BYTES, useMediaStorage } from '../../../../../utils/media'

/** Kelonggaran untuk pembatas dan field multipart selain file. */
const MULTIPART_OVERHEAD = 64 * 1024

export default defineAdminSiteHandler(async ({ event, editor, site, admin }) => {
  const storage = useMediaStorage()
  if (!storage) throw createError({ statusCode: 503, statusMessage: 'Upload belum diaktifkan: MEDIA_DIR belum diatur di server' })

  const length = Number(event.req.headers.get('content-length'))
  if (!Number.isFinite(length) || length <= 0) throw createError({ statusCode: 411, statusMessage: 'Content-Length wajib diisi' })
  if (length > MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD) throw tooLarge()

  const form = await event.req.formData().catch(() => {
    throw createError({ statusCode: 400, statusMessage: 'Body harus multipart/form-data' })
  })
  const file = form.get('file')
  if (!(file instanceof Blob)) throw createError({ statusCode: 422, statusMessage: 'Pilih file gambar', data: { kind: 'invalid', issues: [{ field: 'file', message: 'Pilih file gambar' }] } })
  if (file.size > MAX_UPLOAD_BYTES) throw tooLarge()

  const bytes = new Uint8Array(await file.arrayBuffer())
  const info = sniffImage(bytes)
  if (!info) {
    throw createError({ statusCode: 415, statusMessage: 'Hanya gambar JPEG, PNG, atau WebP (maks. 12000 piksel per sisi)', data: { kind: 'invalid', issues: [{ field: 'file', message: 'Hanya gambar JPEG, PNG, atau WebP' }] } })
  }

  const storageKey = newStorageKey(site.code, info.extension)
  await storage.put(storageKey, bytes)
  try {
    const text = (name: string) => {
      const value = form.get(name)
      return typeof value === 'string' ? value : undefined
    }
    return await editor.createMedia(
      site.id,
      { storageKey, mimeType: info.mimeType, sizeBytes: bytes.byteLength, width: info.width, height: info.height },
      { altText: text('altText') ?? '', caption: text('caption'), credit: text('credit') },
      admin.user.id,
    )
  } catch (error) {
    await storage.delete(storageKey)
    throw error
  }
})

function tooLarge() {
  return createError({ statusCode: 413, statusMessage: `File terlalu besar (maks. ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)` })
}
