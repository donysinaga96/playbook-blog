// Tipe dan dimensi gambar dari ISI file (magic bytes), bukan dari nama file
// atau Content-Type kiriman browser (M4 4.3). Hanya JPEG, PNG, dan WebP:
// SVG ditolak karena bisa memuat script, format lain belum dibutuhkan.
// Gambar tidak di-decode; hanya header yang dibaca.

export interface ImageInfo {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  /** Ekstensi untuk storage_key, dari tipe hasil deteksi. */
  extension: 'jpg' | 'png' | 'webp'
  width: number
  height: number
}

/** Batas dimensi agar file "gambar" berukuran raksasa ditolak. */
export const MAX_IMAGE_SIDE = 12_000

const ascii = (b: Uint8Array, at: number, text: string) => [...text].every((c, i) => b[at + i] === c.charCodeAt(0))
const u16be = (b: Uint8Array, at: number) => ((b[at] ?? 0) << 8) | (b[at + 1] ?? 0)
const u32be = (b: Uint8Array, at: number) => ((b[at] ?? 0) * 2 ** 24) + ((b[at + 1] ?? 0) << 16) + ((b[at + 2] ?? 0) << 8) + (b[at + 3] ?? 0)
const u16le = (b: Uint8Array, at: number) => (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8)
const u24le = (b: Uint8Array, at: number) => (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8) | ((b[at + 2] ?? 0) << 16)

function png(b: Uint8Array): ImageInfo | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (!signature.every((v, i) => b[i] === v) || !ascii(b, 12, 'IHDR')) return null
  return { mimeType: 'image/png', extension: 'png', width: u32be(b, 16), height: u32be(b, 20) }
}

function jpeg(b: Uint8Array): ImageInfo | null {
  if (b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null
  let at = 2
  while (at + 9 < b.length) {
    if (b[at] !== 0xff) return null
    const marker = b[at + 1] ?? 0
    // Padding 0xFF berulang di antara segmen.
    if (marker === 0xff) {
      at++
      continue
    }
    // Segmen tanpa panjang: SOI, EOI, RSTn, TEM.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2
      continue
    }
    if (marker === 0xd9 || marker === 0xda) return null // EOI / SOS sebelum SOF: tidak ada dimensi
    const length = u16be(b, at + 2)
    if (length < 2) return null
    // SOF0..SOF15 kecuali DHT (C4), JPG (C8), DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { mimeType: 'image/jpeg', extension: 'jpg', width: u16be(b, at + 7), height: u16be(b, at + 5) }
    }
    at += 2 + length
  }
  return null
}

function webp(b: Uint8Array): ImageInfo | null {
  if (!ascii(b, 0, 'RIFF') || !ascii(b, 8, 'WEBP')) return null
  const base = { mimeType: 'image/webp', extension: 'webp' } as const
  if (ascii(b, 12, 'VP8 ')) {
    // Frame lossy: kode awal 9d 01 2a, lalu lebar/tinggi 14 bit.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null
    return { ...base, width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff }
  }
  if (ascii(b, 12, 'VP8L')) {
    if (b[20] !== 0x2f) return null
    const bits = (b[21] ?? 0) | ((b[22] ?? 0) << 8) | ((b[23] ?? 0) << 16) | ((b[24] ?? 0) << 24)
    return { ...base, width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
  }
  if (ascii(b, 12, 'VP8X')) return { ...base, width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 }
  return null
}

/** Info gambar, atau null bila bukan JPEG/PNG/WebP yang sah atau dimensinya di luar batas. */
export function sniffImage(bytes: Uint8Array): ImageInfo | null {
  const info = png(bytes) ?? jpeg(bytes) ?? webp(bytes)
  if (!info) return null
  const ok = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_IMAGE_SIDE
  return ok(info.width) && ok(info.height) ? info : null
}
