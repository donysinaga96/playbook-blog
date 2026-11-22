import { describe, expect, it } from 'vitest'
import { cleanBlocks, cleanSeo, mergeSeo } from './admin-body'

describe('pembersih isi editor', () => {
  it('tautan: dipangkas, keterangan kosong dibuang, tautan kosong total dihapus', () => {
    expect(cleanBlocks([
      { type: 'link', url: ' https://contoh.test ', label: ' Contoh ', description: ' ' },
      { type: 'link', url: '', label: '' },
    ])).toEqual([{ type: 'link', url: 'https://contoh.test', label: 'Contoh' }])
  })

  it('butir daftar kosong dibuang, teks dipangkas, keterangan kosong dihilangkan', () => {
    expect(cleanBlocks([
      { type: 'paragraph', text: '  Halo  ' },
      { type: 'list', style: 'bullet', items: ['a', '', '  b ', ' '] },
      { type: 'image', mediaId: 'x', caption: '  ' },
      { type: 'quote', text: 'Q', cite: '' },
    ])).toEqual([
      { type: 'paragraph', text: 'Halo' },
      { type: 'list', style: 'bullet', items: ['a', 'b'] },
      { type: 'image', mediaId: 'x' },
      { type: 'quote', text: 'Q' },
    ])
  })

  it('block kosong dibuang (draf berisi judul saja tetap bisa disimpan)', () => {
    expect(cleanBlocks([
      { type: 'paragraph', text: '   ' },
      { type: 'heading', level: 2, text: '' },
      { type: 'image', mediaId: '' },
      { type: 'list', style: 'numbered', items: ['', ' '] },
      { type: 'embed', provider: 'youtube', url: '' },
      { type: 'paragraph', text: 'isi' },
    ])).toEqual([{ type: 'paragraph', text: 'isi' }])
  })

  it('SEO: nilai tersimpan dipertahankan, field form menimpa atau menghapus', () => {
    const stored = { canonical: '/p/lama', robots: 'noindex', title: 'Lama', description: 'Hapus saya' }
    expect(mergeSeo(stored, { title: ' Baru ', description: '' })).toEqual({ canonical: '/p/lama', robots: 'noindex', title: 'Baru' })
  })

  it('SEO: hanya field yang diisi', () => {
    expect(cleanSeo({ title: ' Judul ', description: '', og_image_id: null, robots: undefined })).toEqual({ title: 'Judul' })
  })
})
