// Membersihkan isi editor sebelum dikirim: block yang masih kosong dibuang
// (mis. paragraf bawaan form baru, agar draf berisi judul saja bisa
// disimpan), teks dipangkas, keterangan/sumber kosong dihilangkan. Validasi
// akhir tetap di server (skema block v1).
import type { Block } from '@framework/core'

export function cleanBlocks(blocks: Block[]): Block[] {
  return blocks.map(cleanBlock).filter((b) => !isEmptyBlock(b))
}

function isEmptyBlock(b: Block): boolean {
  switch (b.type) {
    case 'paragraph':
    case 'heading':
    case 'quote':
      return b.text === ''
    case 'image':
      return b.mediaId === ''
    case 'list':
      return b.items.length === 0
    case 'embed':
      return b.url === ''
  }
}

function cleanBlock(b: Block): Block {
  switch (b.type) {
    case 'paragraph':
    case 'heading':
      return { ...b, text: b.text.trim() }
    case 'quote':
      return { type: 'quote', text: b.text.trim(), ...(b.cite?.trim() ? { cite: b.cite.trim() } : {}) }
    case 'image':
      return { type: 'image', mediaId: b.mediaId, ...(b.caption?.trim() ? { caption: b.caption.trim() } : {}) }
    case 'list':
      return { ...b, items: b.items.map((i) => i.trim()).filter(Boolean) }
    case 'embed':
      return { ...b, url: b.url.trim() }
  }
}

/**
 * SEO yang dikirim: nilai tersimpan dipertahankan, field yang ada di form
 * (`edited`) menimpa atau, bila dikosongkan, menghapusnya. Tanpa ini, form
 * yang hanya punya sebagian field (halaman, kategori) menghapus sisanya
 * (canonical, gambar OG, robots) saat disimpan.
 */
export function mergeSeo(stored: Record<string, unknown>, edited: Record<string, string | null | undefined>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...stored }
  for (const [key, value] of Object.entries(edited)) {
    const v = value?.trim()
    if (v) out[key] = v
    else delete out[key]
  }
  return out
}

/** Field SEO kosong tidak dikirim (skema menolak string kosong). */
export function cleanSeo(seo: Record<string, string | null | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(seo).flatMap(([k, v]) => (v && v.trim() ? [[k, v.trim()]] : [])))
}
