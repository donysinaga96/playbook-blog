import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseGeneratedPayload } from './payload'

const valid = () => ({
  version: 1,
  title: 'Cara Membuat Saksang',
  category: 'resep',
  tags: ['Masakan Batak', 'Daging'],
  cover: 'cover',
  images: [
    {
      key: 'cover',
      storageKey: 'dapur-nusantara/2026/11/saksang.webp',
      altText: 'Saksang di piring',
      credit: 'Foto: Contoh',
      sourceUrl: 'https://contoh.test/saksang',
    },
  ],
  body: {
    version: 1,
    blocks: [
      { type: 'paragraph', text: 'Saksang adalah masakan Batak.' },
      { type: 'image', image: 'cover' },
      { type: 'embed', provider: 'youtube', url: 'https://www.youtube.com/watch?v=abc' },
    ],
  },
  references: [{ title: 'Resep asli', url: 'http://contoh.test/resep', publisher: 'Contoh' }],
})

describe('parseGeneratedPayload', () => {
  it('menerima payload lengkap dan mengisi default', () => {
    const result = parseGeneratedPayload(valid())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.payload.format).toBe('STANDARD')
    expect(result.payload.references[0]?.kind).toBe('ARTICLE')
    expect(result.payload.seo).toEqual({})
  })

  const REMOVE = Symbol('hapus')
  /** Mengubah satu nilai di payload lewat path; REMOVE = hapus key. */
  function set(target: unknown, path: (string | number)[], value: unknown): void {
    let node = target as Record<string | number, unknown>
    for (const key of path.slice(0, -1)) node = node[key] as Record<string | number, unknown>
    const last = path.at(-1)!
    if (value === REMOVE) delete node[last]
    else node[last] = value
  }
  const IMAGE = { key: 'cover', storageKey: 'dapur-nusantara/x.webp', altText: 'x' }

  it.each<[string, (string | number)[], unknown, string]>([
    ['versi tidak dikenal', ['version'], 2, 'version'],
    ['tanpa kategori', ['category'], REMOVE, 'category'],
    ['slug huruf besar', ['slug'], 'Saksang', 'slug'],
    ['body kosong', ['body', 'blocks'], [], 'body.blocks'],
    ['block gambar memakai mediaId', ['body', 'blocks', 1], { type: 'image', mediaId: '01930000-0000-7000-8000-000000000001' }, 'body.blocks.1'],
    ['block gambar ke key yang tidak ada', ['body', 'blocks', 1, 'image'], 'tidak-ada', 'body.blocks.1.image'],
    ['sampul ke key yang tidak ada', ['cover'], 'lain', 'cover'],
    ['key gambar dobel', ['images', 1], IMAGE, 'images.1.key'],
    ['storageKey path traversal', ['images', 0, 'storageKey'], 'dapur-nusantara/../rahasia', 'images.0.storageKey'],
    ['gambar tanpa alt', ['images', 0, 'altText'], REMOVE, 'images.0.altText'],
    ['embed provider tidak dikenal', ['body', 'blocks', 2, 'provider'], 'tiktok', 'body.blocks.2.provider'],
    ['URL referensi javascript:', ['references', 0, 'url'], 'javascript:alert(1)', 'references.0.url'],
    ['URL referensi huruf besar (ditolak database)', ['references', 0, 'url'], 'HTTPS://contoh.test/x', 'references.0.url'],
    ['URL referensi berisi spasi', ['references', 0, 'url'], 'https://contoh.test/a b', 'references.0.url'],
    ['URL referensi dobel', ['references', 1], { title: 'Lagi', url: 'http://contoh.test/resep' }, 'references.1.url'],
    ['tag dobel beda tulisan', ['tags', 2], 'masakan-batak', 'tags.2'],
    ['tag tanpa huruf/angka', ['tags', 2], '!!!', 'tags.2'],
    ['key tak dikenal (status)', ['status'], 'PUBLISHED', ''],
    ['HTML mentah di paragraph', ['body', 'blocks', 0, 'html'], '<b>x</b>', 'body.blocks.0'],
    ['block link di body v1', ['body', 'blocks', 0], { type: 'link', url: 'https://contoh.test', label: 'x' }, 'body.blocks.0.type'],
  ])('menolak: %s', (_name, path, value, issuePath) => {
    const payload = valid()
    set(payload, path, value)
    const result = parseGeneratedPayload(payload)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.map((i) => i.path)).toContain(issuePath)
  })

  it('body v2 boleh memuat block link', () => {
    const p = valid()
    const result = parseGeneratedPayload({ ...p, body: { version: 2, blocks: [...p.body.blocks, { type: 'link', url: 'https://sscasn.bkn.go.id', label: 'Portal SSCASN' }] } })
    expect(result.ok ? [] : result.issues).toEqual([])
  })

  it('bukan object = satu masalah, tidak melempar', () => {
    const result = parseGeneratedPayload('teks')
    expect(result.ok).toBe(false)
  })

  it('contoh payload di docs/kontrak-agent.md valid', () => {
    const doc = readFileSync(fileURLToPath(new URL('../../../../docs/kontrak-agent.md', import.meta.url)), 'utf8')
    const match = /<!-- contoh-payload -->\s*```json\n([\s\S]*?)```/.exec(doc)
    expect(match, 'blok ```json setelah <!-- contoh-payload --> tidak ditemukan').not.toBeNull()
    const result = parseGeneratedPayload(JSON.parse(match![1]!))
    expect(result.ok ? [] : result.issues).toEqual([])
  })
})
