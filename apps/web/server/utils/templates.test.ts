// Registry server (entry ./manifest) dan registry Vue (app/templates.ts)
// harus berisi template yang sama (ADR-008). Bila satu template hanya
// didaftarkan di Vue, server menyelesaikan theme site itu ke base dan
// template barunya tidak pernah tampil.
import { describe, expect, it } from 'vitest'
import { templateRegistry } from '../../app/templates'
import { templateManifests } from './templates'

describe('registry template server dan Vue', () => {
  it('key, versi, dan fallback sama', () => {
    const list = (r: typeof templateManifests) => r.templates.map((t) => `${t.key}@${t.version}`)
    expect(list(templateRegistry)).toEqual(list(templateManifests))
    expect(templateRegistry.fallback.key).toBe(templateManifests.fallback.key)
  })

  it('setiap definisi Vue memakai manifest yang sama dengan server', () => {
    for (const manifest of templateManifests.templates) {
      const definition = templateRegistry.get(manifest.key)
      expect(definition.tokens).toBe(manifest.tokens)
      expect(definition.sections).toBe(manifest.sections)
      expect(definition.defaultLayouts).toBe(manifest.defaultLayouts)
    }
  })
})
