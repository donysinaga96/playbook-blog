// Storage media di server (M4 4.3): disk lokal di MEDIA_DIR. Dipakai route
// publik /media (baca) dan API admin (upload, hapus, pratinjau).
import { createLocalMediaStorage, MAX_IMAGE_BYTES, splitStorageKey, type MediaStorage } from '@framework/core'
import { getRouterParam, type RequestEvent } from 'nuxt/server'

/** Batas ukuran satu file upload. */
export const MAX_UPLOAD_BYTES = MAX_IMAGE_BYTES

let storage: MediaStorage | null | undefined

/** Null bila MEDIA_DIR belum diatur (upload ditolak; di dev media seed tampil sebagai placeholder). */
export function useMediaStorage(): MediaStorage | null {
  if (storage === undefined) {
    const dir = process.env['MEDIA_DIR']?.trim()
    storage = dir ? createLocalMediaStorage(dir) : null
  }
  return storage
}

const CONTENT_TYPES: Record<string, string> = {
  avif: 'image/avif',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
}

/** Content-Type dari ekstensi storage_key; null bila bukan gambar yang dikenal. */
export function mediaContentType(storageKey: string): string | null {
  return CONTENT_TYPES[storageKey.split('.').pop()?.toLowerCase() ?? ''] ?? null
}

export interface MediaFile {
  data: Uint8Array | string
  contentType: string
  /** true = placeholder dev, bukan file sungguhan. */
  placeholder: boolean
}

/** Isi file media; di dev, file yang tidak ada diganti placeholder SVG. Null = tidak ada. */
export async function readMediaFile(storageKey: string): Promise<MediaFile | null> {
  const segments = splitStorageKey(storageKey)
  const contentType = mediaContentType(storageKey)
  if (!segments || !contentType) return null
  const data = await useMediaStorage()?.read(storageKey)
  if (data) return { data, contentType, placeholder: false }
  if (import.meta.dev) return { data: placeholderSvg(segments.at(-1) ?? storageKey), contentType: 'image/svg+xml', placeholder: true }
  return null
}

/** Header aman untuk file media: SVG tidak bisa menjalankan script, tipe tidak ditebak browser. */
export function mediaSecurityHeaders(headers: Headers) {
  headers.set('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
  headers.set('x-content-type-options', 'nosniff')
}

/** Placeholder dev: kotak abu-abu 16:9 bertuliskan nama file. */
function placeholderSvg(name: string): string {
  const label = name.replace(/[^a-zA-Z0-9._-]/g, '')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">`
    + `<rect width="1600" height="900" fill="#d9dde3"/>`
    + `<path d="M0 0L1600 900M1600 0L0 900" stroke="#c3c9d1" stroke-width="4"/>`
    + `<text x="800" y="470" font-family="system-ui, sans-serif" font-size="56" fill="#5b6470" text-anchor="middle">${label}</text>`
    + `</svg>`
}

/**
 * storage_key dari parameter route `[...key]`, sudah di-decode. null bila
 * percent-encoding rusak (decodeURIComponent melempar URIError): jawab 404,
 * bukan 500.
 */
export function mediaKeyParam(event: RequestEvent): string | null {
  try {
    return decodeURIComponent(getRouterParam(event, 'key') ?? '')
  } catch {
    return null
  }
}
