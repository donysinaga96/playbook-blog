import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineManifest } from './manifest'
import { defineSection } from './sections'
import { describeTemplate, validateThemeDraft } from './theme-admin'

const hex = z.string().regex(/^#[0-9a-f]{6}$/i).meta({ title: 'Warna aksen' })
const manifest = defineManifest({
  key: 'base',
  version: '1.2.0',
  name: 'Base',
  tokens: { schema: z.object({ color: z.object({ primary: hex }).meta({ title: 'Warna' }) }), defaults: { color: { primary: '#000000' } } },
  options: { schema: z.object({ showDate: z.boolean().meta({ title: 'Tanggal' }) }), defaults: { showDate: false } },
  sections: {
    grid: defineSection({ props: z.object({ limit: z.number().int().min(1).max(12).default(6) }).meta({ title: 'Grid' }), data: ({ limit }) => ({ source: 'latest', limit }) }),
  },
  defaultLayouts: { home: [{ type: 'grid' }] },
})

describe('describeTemplate', () => {
  it('JSON Schema dari skema manifest, dengan judul dari meta', () => {
    const d = describeTemplate(manifest)
    expect(d).toMatchObject({ key: 'base', version: '1.2.0', defaultLayouts: { home: [{ type: 'grid' }] } })
    expect(d.tokens.schema).toMatchObject({ type: 'object', properties: { color: { title: 'Warna', properties: { primary: { title: 'Warna aksen', pattern: '^#[0-9a-f]{6}$' } } } } })
    expect(d.options.schema).toMatchObject({ properties: { showDate: { type: 'boolean' } } })
    expect(d.sections).toEqual([{ type: 'grid', title: 'Grid', schema: expect.objectContaining({ properties: { limit: expect.objectContaining({ default: 6, maximum: 12 }) } }) }])
    expect(JSON.parse(JSON.stringify(d))).toEqual(d)
  })
})

describe('validateThemeDraft', () => {
  const draft = (patch: Record<string, unknown> = {}) => ({ tokens: { color: { primary: '#123456' } }, options: { showDate: true }, layouts: { home: [{ type: 'grid', props: { limit: 3 } }] }, ...patch })

  it('draf valid -> nilai bersih (default props diisi)', () => {
    expect(validateThemeDraft(manifest, draft({ layouts: { home: [{ type: 'grid' }] } }))).toEqual({
      ok: true,
      value: { tokens: { color: { primary: '#123456' } }, options: { showDate: true }, layouts: { home: [{ type: 'grid', props: { limit: 6 } }] } },
    })
  })

  it('tanpa layouts = bawaan template; array kosong = tanpa section', () => {
    expect(validateThemeDraft(manifest, draft({ layouts: {} }))).toMatchObject({ ok: true, value: { layouts: {} } })
    expect(validateThemeDraft(manifest, draft({ layouts: { home: [] } }))).toMatchObject({ ok: true, value: { layouts: { home: [] } } })
  })

  it('nilai salah DITOLAK per field (bukan diganti default seperti saat render)', () => {
    const result = validateThemeDraft(manifest, draft({
      tokens: { color: { primary: 'merah' } },
      options: { showDate: 'ya' },
      layouts: { home: [{ type: 'grid', props: { limit: 99 } }, { type: 'carousel' }], about: [] },
    }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.map((i) => i.field)).toEqual(['tokens.color.primary', 'options.showDate', 'layouts.home.0.props.limit', 'layouts.home.1.type', 'layouts.about'])
    }
  })
})
