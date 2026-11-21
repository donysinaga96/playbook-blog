import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineSection, resolveLayout, SECTION_LIMITS, type LayoutItem } from './sections'

const sections = {
  hero: defineSection({
    props: z.object({ source: z.enum(['featured', 'latest']).default('featured'), limit: z.number().int().min(1).max(3).default(1) }),
    data: ({ source, limit }) => ({ source, limit }),
  }),
  strip: defineSection({
    props: z.object({ categorySlug: z.string().min(1), limit: z.number().int().min(1).max(12).default(4) }),
    data: ({ categorySlug, limit }) => ({ source: 'category', slug: categorySlug, limit }),
  }),
  note: defineSection({ props: z.object({ text: z.string().default('Halo') }) }),
}
const fallback: LayoutItem[] = [{ type: 'hero' }]
const resolve = (raw: unknown) => resolveLayout({ sections, raw, fallback, label: 'layouts.home' })

describe('resolveLayout', () => {
  it('layout valid -> props tervalidasi (dengan default) dan permintaan data', () => {
    expect(resolve([{ type: 'hero', props: { limit: 2 } }, { type: 'strip', props: { categorySlug: 'gadget' } }, { type: 'note' }])).toEqual({
      sections: [
        { type: 'hero', props: { source: 'featured', limit: 2 }, articles: { source: 'featured', limit: 2 } },
        { type: 'strip', props: { categorySlug: 'gadget', limit: 4 }, articles: { source: 'category', slug: 'gadget', limit: 4 } },
        { type: 'note', props: { text: 'Halo' }, articles: null },
      ],
      issues: [],
    })
  })

  it('section tidak dikenal atau props salah dilewati dan dicatat; sisanya tetap', () => {
    const { sections: out, issues } = resolve([
      { type: 'carousel' },
      { type: 'hero', props: { limit: 9 } },
      'hero',
      { type: 'strip', props: { categorySlug: 'resep', limit: 8, extra: true } },
    ])
    expect(out).toEqual([{ type: 'strip', props: { categorySlug: 'resep', limit: 8 }, articles: { source: 'category', slug: 'resep', limit: 8 } }])
    expect(issues).toEqual([
      'layouts.home[0]: section "carousel" tidak dikenal, dilewati',
      expect.stringMatching(/^layouts\.home\[1\]: props section "hero" tidak valid \(limit: .+\), dilewati$/),
      'layouts.home[2]: bukan section ({ type, props }), dilewati',
    ])
  })

  it('nama section dari prototype object tidak dianggap dikenal', () => {
    expect(resolve([{ type: 'toString' }, { type: 'note' }]).issues).toEqual(['layouts.home[0]: section "toString" tidak dikenal, dilewati'])
  })

  it.each([undefined, null, []])('layout kosong (%j) -> defaultLayouts tanpa issue', (raw) => {
    expect(resolve(raw)).toEqual({ sections: [{ type: 'hero', props: { source: 'featured', limit: 1 }, articles: { source: 'featured', limit: 1 } }], issues: [] })
  })

  it('layout bukan array -> default, dicatat', () => {
    const result = resolve({ type: 'hero' })
    expect(result.sections.map((s) => s.type)).toEqual(['hero'])
    expect(result.issues).toEqual(['layouts.home: bukan array, memakai default'])
  })

  it('tidak ada section yang valid -> default, dicatat', () => {
    const result = resolve([{ type: 'carousel' }])
    expect(result.sections.map((s) => s.type)).toEqual(['hero'])
    expect(result.issues).toEqual([
      'layouts.home[0]: section "carousel" tidak dikenal, dilewati',
      'layouts.home: tidak ada section yang valid, memakai default',
    ])
  })

  it(`lebih dari ${SECTION_LIMITS.maxSectionsPerPage} section -> sisanya dibuang, dicatat sekali`, () => {
    const result = resolve(Array.from({ length: SECTION_LIMITS.maxSectionsPerPage + 3 }, () => ({ type: 'note' })))
    expect(result.sections).toHaveLength(SECTION_LIMITS.maxSectionsPerPage)
    expect(result.issues).toEqual([`layouts.home: lebih dari ${SECTION_LIMITS.maxSectionsPerPage} section, sisanya diabaikan`])
  })

  it('permintaan data dijepit dan dicek, apa pun skema props-nya', () => {
    const loose = {
      big: defineSection({ props: z.object({}), data: () => ({ source: 'latest', limit: 500 }) }),
      zero: defineSection({ props: z.object({}), data: () => ({ source: 'latest', limit: 0 }) }),
      noslug: defineSection({ props: z.object({}), data: () => ({ source: 'tag', limit: 3 }) }),
      bad: defineSection({ props: z.object({}), data: () => ({ source: 'random' as 'latest', limit: 3 }) }),
      boom: defineSection({ props: z.object({}), data: () => { throw new Error('rusak') } }),
    }
    const result = resolveLayout({ sections: loose, raw: ['big', 'zero', 'noslug', 'bad', 'boom'].map((type) => ({ type })), fallback: [], label: 'l' })
    expect(result.sections).toEqual([
      { type: 'big', props: {}, articles: { source: 'latest', limit: SECTION_LIMITS.maxArticles } },
      { type: 'zero', props: {}, articles: { source: 'latest', limit: 1 } },
    ])
    expect(result.issues).toEqual([
      'l[2]: data section "noslug" tidak valid (source tag butuh slug), dilewati',
      expect.stringMatching(/^l\[3\]: data section "bad" tidak valid \(source: .+\), dilewati$/),
      'l[4]: data section "boom" tidak valid (rusak), dilewati',
    ])
  })

  it('slug hanya ikut untuk source category dan tag', () => {
    const odd = { s: defineSection({ props: z.object({}), data: () => ({ source: 'latest', slug: 'x', limit: 2 }) }) }
    expect(resolveLayout({ sections: odd, raw: [{ type: 's' }], fallback: [], label: 'l' }).sections[0]?.articles).toEqual({ source: 'latest', limit: 2 })
  })
})
