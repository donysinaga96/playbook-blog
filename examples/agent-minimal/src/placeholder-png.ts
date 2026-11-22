// PNG polos bergradasi, tanpa dependency. Hanya agar alur gambar bisa diuji
// tanpa model gambar atau file contoh; ganti dengan gambar sungguhan.
import { crc32, deflateSync } from 'node:zlib'

export function placeholderPng(width = 1200, height = 630, from = [16, 42, 84], to = [74, 120, 180]): Uint8Array {
  const row = 1 + width * 3
  const raw = Buffer.alloc(row * height)
  for (let y = 0; y < height; y++) {
    raw[y * row] = 0 // filter: none
    const t = y / (height - 1)
    const rgb = from.map((f, i) => Math.round(f + (to[i]! - f) * t))
    for (let x = 0; x < width; x++) raw.set(rgb, y * row + 1 + x * 3)
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // RGB

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}
