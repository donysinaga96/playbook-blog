import { describe, expect, it } from 'vitest'
import { appendUnique, nextMediaPage } from './media-paging'

const ids = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => ({ id: `m${from + i}` }))

describe('paging galeri media', () => {
  it('tanpa perubahan: halaman berikutnya biasa', () => {
    expect(nextMediaPage(30)).toBe(2)
    expect(nextMediaPage(60)).toBe(3)
  })

  it('setelah unggah: item yang tergeser ke halaman 2 tidak dobel', () => {
    // Server: m0 (baru) .. m31; layar: m0 + 30 item lama (m1..m30).
    const server = ids(0, 32)
    const shown = server.slice(0, 31)
    const page = nextMediaPage(shown.length)
    const merged = appendUnique(shown, server.slice((page - 1) * 30, page * 30))
    expect(merged.map((x) => x.id)).toEqual(server.map((x) => x.id))
  })

  it('setelah hapus: item yang naik ke halaman 1 tidak terlewat', () => {
    // Server setelah satu dihapus: m0..m30 (31 item); layar: 29 item pertama.
    const server = ids(0, 31)
    const shown = server.slice(0, 29)
    const page = nextMediaPage(shown.length)
    const merged = appendUnique(shown, server.slice((page - 1) * 30, page * 30))
    expect(merged.map((x) => x.id)).toEqual(server.slice(0, 30).map((x) => x.id))
  })
})
