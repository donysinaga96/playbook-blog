import type { Block, Body } from './blocks'

/**
 * Teks polos dari body untuk kolom articles.body_text, yang dipakai
 * search_vector (konfigurasi 'simple', bobot C). Aplikasi wajib mengisinya
 * setiap kali body berubah; database tidak mengekstraknya sendiri.
 *
 * Yang masuk: paragraph, heading, isi list, dan kutipan. Caption gambar,
 * sumber kutipan, dan embed tidak ikut, agar pencarian tidak dipenuhi
 * keterangan yang bukan isi tulisan.
 * Antar-block digabung satu spasi dan semua whitespace dipadatkan, sama
 * dengan data seed.
 */
export function extractBodyText(body: Pick<Body, 'blocks'>): string {
  return body.blocks
    .flatMap(blockText)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function blockText(block: Block): string[] {
  switch (block.type) {
    case 'paragraph':
    case 'heading':
    case 'quote':
      return [block.text]
    case 'list':
      return block.items
    case 'image':
    case 'embed':
      return []
    default: {
      // Pemeriksaan kelengkapan: menambah tipe block baru tanpa menangani
      // di sini membuat typecheck gagal.
      const unreachable: never = block
      return unreachable
    }
  }
}
