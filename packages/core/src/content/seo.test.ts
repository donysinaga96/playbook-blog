import { describe, expect, it } from 'vitest'
import { parseContentSeo } from './seo'

describe('parseContentSeo', () => {
  it('key valid dipakai, key salah diabaikan satu per satu', () => {
    expect(parseContentSeo({
      title: ' Judul SEO ',
      description: '',
      canonical: '//evil.example/x',
      og_image_id: '01930000-0000-7000-8000-000000000202',
      robots: 'noindex',
      extra: 1,
    })).toEqual({ title: 'Judul SEO', og_image_id: '01930000-0000-7000-8000-000000000202', robots: 'noindex' })
  })

  it.each([['/review/x'], ['https://example.com/x']])('canonical sah: %s', (canonical) => {
    expect(parseContentSeo({ canonical })).toEqual({ canonical })
  })

  it.each([null, 'teks', [], undefined])('bukan object (%j) -> kosong', (raw) => {
    expect(parseContentSeo(raw)).toEqual({})
  })
})
