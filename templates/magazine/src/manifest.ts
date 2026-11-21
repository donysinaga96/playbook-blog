// Entry ./manifest template magazine: data dan skema saja, tanpa .vue/.css
// (ADR-008). Komponen dan CSS ditambahkan di ./index.ts.
import baseManifest from '@framework/template-base/manifest'
import { defineManifest } from '@framework/template-kit'

export default defineManifest({
  key: 'magazine',
  version: '1.0.0',
  name: 'Magazine',
  extends: baseManifest,
  tokens: {
    defaults: {
      color: { primary: '#0f62fe', surface: '#ffffff', text: '#161616' },
      font: { heading: 'Inter', body: 'Inter' },
      radius: { card: '8px' },
    },
  },
  options: {
    defaults: { header: { style: 'centered', showDate: true } },
  },
  defaultLayouts: {
    home: [
      { type: 'hero', props: { source: 'featured', limit: 1 } },
      { type: 'latest-grid', props: { limit: 6 } },
    ],
  },
})
