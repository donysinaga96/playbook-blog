import { describe, expect, it } from 'vitest'
import { BLOCK_TYPES, bodySchema, emptyBody, parseBody, parseBodyLenient } from './blocks'

const mediaId = '01930000-0000-7000-8000-000000000202'

describe('block body v1', () => {
  it('mendukung 6 tipe block', () => {
    expect([...BLOCK_TYPES].sort()).toEqual(['embed', 'heading', 'image', 'list', 'paragraph', 'quote'])
  })

  it('menerima body kosong yang sama dengan default database', () => {
    expect(parseBody(emptyBody())).toEqual({ version: 1, blocks: [] })
    expect(parseBody({ version: 1, blocks: [] })).toEqual({ version: 1, blocks: [] })
  })

  it('menerima satu contoh valid untuk setiap tipe block', () => {
    const body = {
      version: 1,
      blocks: [
        { type: 'paragraph', text: 'Halo dunia.' },
        { type: 'heading', level: 2, text: 'Bagian' },
        { type: 'image', mediaId, caption: 'Keterangan' },
        { type: 'quote', text: 'Kutipan.', cite: 'Seseorang' },
        { type: 'list', style: 'numbered', items: ['satu', 'dua'] },
        { type: 'embed', provider: 'youtube', url: 'https://www.youtube.com/watch?v=abc' },
      ],
    }
    expect(parseBody(body)).toEqual(body)
  })

  it.each([
    ['array tanpa pembungkus versi (format lama)', [{ type: 'paragraph', text: 'x' }]],
    ['versi tidak dikenal', { version: 2, blocks: [] }],
    ['tanpa versi', { blocks: [] }],
    ['key tambahan di body', { version: 1, blocks: [], extra: true }],
    ['tipe block tidak dikenal', { version: 1, blocks: [{ type: 'html', html: '<b>x</b>' }] }],
    ['key tambahan di block (mis. html mentah)', { version: 1, blocks: [{ type: 'paragraph', text: 'x', html: '<b>x</b>' }] }],
    ['paragraph kosong / spasi saja', { version: 1, blocks: [{ type: 'paragraph', text: '   ' }] }],
    ['heading level 1', { version: 1, blocks: [{ type: 'heading', level: 1, text: 'x' }] }],
    ['heading level 5', { version: 1, blocks: [{ type: 'heading', level: 5, text: 'x' }] }],
    ['image tanpa mediaId', { version: 1, blocks: [{ type: 'image' }] }],
    ['image dengan mediaId bukan UUID', { version: 1, blocks: [{ type: 'image', mediaId: 'logo.png' }] }],
    ['list kosong', { version: 1, blocks: [{ type: 'list', style: 'bullet', items: [] }] }],
    ['list style tidak dikenal', { version: 1, blocks: [{ type: 'list', style: 'roman', items: ['x'] }] }],
    ['embed provider tidak dikenal', { version: 1, blocks: [{ type: 'embed', provider: 'evil', url: 'https://evil.test/x' }] }],
    ['embed dengan http (bukan https)', { version: 1, blocks: [{ type: 'embed', provider: 'youtube', url: 'http://youtube.com/x' }] }],
    ['embed dengan javascript:', { version: 1, blocks: [{ type: 'embed', provider: 'youtube', url: 'javascript:alert(1)' }] }],
  ])('menolak: %s', (_label, body) => {
    expect(bodySchema.safeParse(body).success).toBe(false)
  })

  it('memangkas spasi di tepi teks', () => {
    const body = parseBody({ version: 1, blocks: [{ type: 'paragraph', text: '  halo  ' }] })
    expect(body.blocks[0]).toEqual({ type: 'paragraph', text: 'halo' })
  })
})

describe('parseBodyLenient (untuk render)', () => {
  it('mempertahankan block valid dan melewati sisanya sambil melaporkan', () => {
    const { body, skipped } = parseBodyLenient({
      version: 1,
      blocks: [
        { type: 'paragraph', text: 'ok' },
        { type: 'hologram', data: 1 },
        { type: 'heading', level: 9, text: 'rusak' },
        'bukan object',
        { type: 'quote', text: 'ok juga' },
      ],
    })
    expect(body.blocks.map((b) => b.type)).toEqual(['paragraph', 'quote'])
    expect(skipped).toEqual([
      { index: 1, type: 'hologram', reason: 'tipe block tidak dikenal' },
      { index: 2, type: 'heading', reason: 'isi block tidak valid' },
      { index: 3, type: null, reason: 'tipe block tidak dikenal' },
    ])
  })

  it('tidak crash bila bentuk luar rusak; hasilnya body kosong', () => {
    for (const raw of [null, undefined, 'teks', 42, [], { version: 1 }, { blocks: [] }]) {
      const { body, skipped } = parseBodyLenient(raw)
      expect(body).toEqual(emptyBody())
      expect(skipped).toHaveLength(1)
    }
  })

  it('menerima versi lain asal bentuk luarnya benar, dan menyaring block-nya', () => {
    const { body, skipped } = parseBodyLenient({ version: 2, blocks: [{ type: 'paragraph', text: 'x' }] })
    expect(body.blocks).toHaveLength(1)
    expect(skipped).toEqual([])
  })
})
