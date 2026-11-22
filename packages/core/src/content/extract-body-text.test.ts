import { describe, expect, it } from 'vitest'
import { emptyBody, parseBody } from './blocks'
import { extractBodyText } from './extract-body-text'

const mediaId = '01930000-0000-7000-8000-000000000202'

describe('extractBodyText', () => {
  it('body kosong menghasilkan string kosong (default kolom body_text)', () => {
    expect(extractBodyText(emptyBody())).toBe('')
  })

  it('tautan: label dan keterangan ikut, URL tidak', () => {
    expect(extractBodyText({ blocks: [
      { type: 'link', url: 'https://sscasn.bkn.go.id', label: 'Portal SSCASN', description: 'Pendaftaran resmi' },
      { type: 'link', url: 'mailto:a@b.id', label: 'Email' },
    ] })).toBe('Portal SSCASN Pendaftaran resmi Email')
  })

  it('menggabung paragraph, heading, list, dan quote dengan satu spasi', () => {
    const body = parseBody({
      version: 1,
      blocks: [
        { type: 'paragraph', text: 'Harga turun.' },
        { type: 'heading', level: 2, text: 'Yang perlu dicek' },
        { type: 'list', style: 'bullet', items: ['Engsel', 'Garansi'] },
        { type: 'quote', text: 'Layak dibeli.', cite: 'Penguji' },
      ],
    })
    expect(extractBodyText(body)).toBe('Harga turun. Yang perlu dicek Engsel Garansi Layak dibeli.')
  })

  it('tidak memasukkan caption gambar, sumber kutipan, maupun embed', () => {
    const body = parseBody({
      version: 1,
      blocks: [
        { type: 'image', mediaId, caption: 'Foto ponsel lipat' },
        { type: 'quote', text: 'Isi kutipan', cite: 'Nama Sumber' },
        { type: 'embed', provider: 'youtube', url: 'https://www.youtube.com/watch?v=abc' },
      ],
    })
    const text = extractBodyText(body)
    expect(text).toBe('Isi kutipan')
    expect(text).not.toMatch(/ponsel|Sumber|youtube/)
  })

  it('memadatkan whitespace, termasuk baris baru di dalam teks', () => {
    const body = parseBody({
      version: 1,
      blocks: [
        { type: 'paragraph', text: 'baris satu\n\nbaris   dua' },
        { type: 'paragraph', text: 'tiga' },
      ],
    })
    expect(extractBodyText(body)).toBe('baris satu baris dua tiga')
  })

  it('body hanya berisi gambar menghasilkan string kosong', () => {
    expect(extractBodyText(parseBody({ version: 1, blocks: [{ type: 'image', mediaId }] }))).toBe('')
  })
})
