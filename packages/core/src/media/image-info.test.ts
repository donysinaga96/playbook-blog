import { describe, expect, it } from 'vitest'
import { sniffImage } from './image-info'

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)))
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const be16 = (n: number) => [(n >>> 8) & 255, n & 255]
const le16 = (n: number) => [n & 255, (n >>> 8) & 255]
const le24 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255]

const PNG = (w: number, h: number) => bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], be32(13), 'IHDR', be32(w), be32(h), [8, 6, 0, 0, 0])
// JPEG: SOI, APP0 (panjang 16), SOF0.
const JPEG = (w: number, h: number) => bytes([0xff, 0xd8], [0xff, 0xe0], be16(16), 'JFIF', [0, 1, 1, 0, 0, 1, 0, 1, 0, 0], [0xff, 0xc0], be16(17), [8], be16(h), be16(w), [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1])
const WEBP_LOSSY = (w: number, h: number) => bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8 ', [0, 0, 0, 0], [0, 0, 0], [0x9d, 0x01, 0x2a], le16(w), le16(h))
const WEBP_EXT = (w: number, h: number) => bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8X', [10, 0, 0, 0], [0, 0, 0, 0], le24(w - 1), le24(h - 1))

describe('sniffImage', () => {
  it.each([
    ['PNG', PNG(1600, 900), { mimeType: 'image/png', extension: 'png', width: 1600, height: 900 }],
    ['JPEG', JPEG(1200, 800), { mimeType: 'image/jpeg', extension: 'jpg', width: 1200, height: 800 }],
    ['WebP lossy', WEBP_LOSSY(640, 480), { mimeType: 'image/webp', extension: 'webp', width: 640, height: 480 }],
    ['WebP extended', WEBP_EXT(4000, 3000), { mimeType: 'image/webp', extension: 'webp', width: 4000, height: 3000 }],
  ])('%s: tipe dan dimensi dari isi file', (_label, data, expected) => {
    expect(sniffImage(data)).toEqual(expected)
  })

  it.each([
    ['SVG', bytes('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ['HTML berpura-pura gambar', bytes('<!doctype html><img src=x onerror=alert(1)>')],
    ['GIF (belum didukung)', bytes('GIF89a', le16(10), le16(10))],
    ['kosong', new Uint8Array()],
    ['PNG terpotong', PNG(10, 10).slice(0, 12)],
    ['dimensi nol', PNG(0, 10)],
    ['dimensi raksasa', PNG(50_000, 50_000)],
    ['JPEG tanpa SOF', bytes([0xff, 0xd8, 0xff, 0xd9])],
  ])('menolak %s', (_label, data) => {
    expect(sniffImage(data)).toBeNull()
  })
})
