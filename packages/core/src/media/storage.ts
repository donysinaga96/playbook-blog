// Sisi BACA storage media: storage_key -> URL publik.
//
// storage_key disimpan relatif dan diawali kode site, mis.
//   kabar-tekno/2026/11/hp.webp
// Upload (sisi tulis) menyusul di M4 lewat adapter yang sama. Saat media
// pindah ke R2/CDN, cukup baseUrl yang diganti; data di database tetap.
import type { ImageView } from '@framework/template-kit'
import type { MediaRef } from '../repositories/types'

export interface MediaUrlOptions {
  /**
   * Awalan URL. Default '/media' (dilayani apps/web dari disk lokal).
   * Bisa URL absolut, mis. https://cdn.example.com/media.
   */
  baseUrl?: string
}

export type MediaUrlResolver = (storageKey: string) => string

/** Satu segmen storage_key yang sah: bukan kosong, '.', atau '..'. */
const SEGMENT = /^(?!\.{1,2}$)[a-zA-Z0-9._-]+$/

/** Memecah storage_key menjadi segmen; null bila key tidak sah (path traversal, karakter aneh). */
export function splitStorageKey(storageKey: string): string[] | null {
  const segments = storageKey.split('/')
  return segments.length >= 2 && segments.every((s) => SEGMENT.test(s)) ? segments : null
}

export function createMediaUrlResolver(options: MediaUrlOptions = {}): MediaUrlResolver {
  const base = (options.baseUrl ?? '/media').replace(/\/+$/, '')
  return (storageKey) => {
    const segments = splitStorageKey(storageKey)
    if (!segments) throw new Error(`storage_key tidak valid: ${JSON.stringify(storageKey)}`)
    return `${base}/${segments.map(encodeURIComponent).join('/')}`
  }
}

/** MediaRef dari repository -> ImageView untuk SmartImage. */
export function toImageView(media: MediaRef, mediaUrl: MediaUrlResolver, fallbackAlt = ''): ImageView {
  return {
    src: mediaUrl(media.storageKey),
    alt: media.altText ?? fallbackAlt,
    width: media.width,
    height: media.height,
    focalX: media.focalX,
    focalY: media.focalY,
    caption: media.caption,
    credit: media.credit,
    sourceUrl: media.sourceUrl,
  }
}
