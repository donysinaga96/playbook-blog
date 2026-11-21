// Slug konten: huruf kecil ASCII, angka, tanda hubung (sama dengan CHECK
// *_slug_format di database), paling panjang 200 karakter.
import { RESERVED_SEGMENTS } from '../views/urls'

export const SLUG_MAX = 200
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Judul -> slug: "Saksang Khas Batak!" -> "saksang-khas-batak". Huruf beraksen jadi huruf dasarnya. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' dan ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '')
}

/**
 * Slug yang tertutup route tetap bila menjadi segmen pertama URL: slug
 * kategori dengan permalink /:category/... atau slug artikel dengan
 * permalink /:slug. Lihat RESERVED_SEGMENTS (ADR-006, ADR-009).
 */
export function isReservedFirstSegment(slug: string): boolean {
  return (RESERVED_SEGMENTS as readonly string[]).includes(slug)
}

/** Token pertama permalink, mis. '/:category/:slug' -> ':category'. */
export function permalinkFirstToken(permalink: string): string {
  return permalink.split('/').filter(Boolean)[0] ?? ''
}

/** Kandidat slug unik: base, base-2, base-3, ... (dipotong agar tetap <= SLUG_MAX). */
export function slugCandidate(base: string, attempt: number): string {
  if (attempt <= 1) return base
  const suffix = `-${attempt}`
  return `${base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/, '')}${suffix}`
}
