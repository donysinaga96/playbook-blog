// GET /media/<storage_key>: file media dari disk lokal (sisi baca storage
// adapter; upload menyusul di M4).
//
//  - Hanya media milik site request ini: storage_key wajib diawali kode
//    site, jadi gambar site lain tidak bisa diambil lewat domain ini.
//  - Path dicek ketat (splitStorageKey) agar tidak bisa keluar dari MEDIA_DIR.
//  - Di dev, file yang tidak ada diganti gambar placeholder SVG, jadi media
//    seed tampil tanpa menyimpan file gambar di Git.
import { readFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { splitStorageKey } from '@framework/core'
import { defineEventHandler, getRouterParam, setResponseStatus } from 'nuxt/server'

const CONTENT_TYPES: Record<string, string> = {
  avif: 'image/avif',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
}

export default defineEventHandler(async (event) => {
  const site = event.context.site
  const key = decodeURIComponent(getRouterParam(event, 'key') ?? '')
  const segments = splitStorageKey(key)
  const extension = key.split('.').pop()?.toLowerCase() ?? ''
  const contentType = CONTENT_TYPES[extension]

  if (!site || !segments || segments[0] !== site.code || !contentType) return notFound(event)

  const headers = event.res.headers
  // SVG bisa memuat script; CSP ini mematikannya bila file dibuka langsung.
  headers.set('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
  headers.set('x-content-type-options', 'nosniff')

  const dir = process.env['MEDIA_DIR']
  if (dir) {
    const base = resolve(dir)
    const file = join(base, ...segments)
    if (file.startsWith(base + sep)) {
      try {
        const data = await readFile(file)
        headers.set('content-type', contentType)
        headers.set('cache-control', 'public, max-age=86400')
        return data
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
  }

  if (import.meta.dev) {
    headers.set('content-type', 'image/svg+xml')
    headers.set('cache-control', 'no-store')
    return placeholderSvg(segments.at(-1) ?? key)
  }
  return notFound(event)
})

function notFound(event: Parameters<typeof setResponseStatus>[0]) {
  setResponseStatus(event, 404)
  event.res.headers.set('content-type', 'text/plain; charset=utf-8')
  return 'Media tidak ditemukan.\n'
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
