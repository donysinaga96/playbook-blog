// Entry ./manifest template base: data dan skema saja, tanpa .vue/.css,
// sehingga server (Nitro) bisa menyelesaikan theme dan layout sebelum view
// model dibangun (ADR-008). Komponen dan CSS ditambahkan di ./index.ts.
import { defineManifest } from '@framework/template-kit'
import { baseOptionDefaults, baseOptionsSchema, baseTokenDefaults, baseTokenSchema } from './config'
import { baseSections } from './sections/definitions'

export default defineManifest({
  key: 'base',
  version: '1.0.0',
  name: 'Base',
  tokens: { schema: baseTokenSchema, defaults: baseTokenDefaults },
  options: { schema: baseOptionsSchema, defaults: baseOptionDefaults },
  menuLocations: ['header', 'footer'],
  adSlots: [],
  sections: baseSections,
  defaultLayouts: {
    home: [
      { type: 'hero', props: { source: 'featured', limit: 1 } },
      { type: 'latest-grid', props: { limit: 9 } },
    ],
  },
})

export * from './config'
export { baseSections, type BaseSectionType } from './sections/definitions'
