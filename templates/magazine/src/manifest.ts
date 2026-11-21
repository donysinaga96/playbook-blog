// Entry ./manifest template magazine: data dan skema saja, tanpa .vue/.css
// (ADR-008). Komponen dan CSS ditambahkan di ./index.ts.
//
// Riwayat versi:
//   1.0.0  rilis pertama
//   1.1.0  slot iklan dideklarasikan di manifest (adSlots), bukan di
//          options; migrasi membuang options.adSlots dari config lama
import baseManifest from '@framework/template-base/manifest'
import { defineManifest, isPlainObject } from '@framework/template-kit'

export default defineManifest({
  key: 'magazine',
  version: '1.1.0',
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
  adSlots: ['header_banner'],
  defaultLayouts: {
    home: [
      { type: 'hero', props: { source: 'featured', limit: 1 } },
      { type: 'latest-grid', props: { limit: 6 } },
    ],
  },
  migrateConfig: {
    // 1.0.0 menyimpan slot iklan di options.adSlots. Sejak 1.1.0 slot
    // dideklarasikan manifest; isi slot (kode iklan) diatur fitur iklan
    // nanti (backlog), jadi nilai lama dibuang.
    '1.1.0': (config) => {
      if (!isPlainObject(config.options) || !('adSlots' in config.options)) return config
      const options = { ...config.options }
      delete options['adSlots']
      return { ...config, options }
    },
  },
})
