// Entry ./manifest template news: data dan skema saja, tanpa .vue/.css
// (ADR-008). Komponen dan CSS ditambahkan di ./index.ts.
//
// News membuktikan kontrak template (ADR-005): tampil jelas berbeda dari
// magazine hanya lewat token, opsi, layout section, dan CSS. Halaman depan
// dibuka dengan daftar judul (headline-list), bukan kartu besar bergambar.
import baseManifest from '@framework/template-base/manifest'
import { defineManifest } from '@framework/template-kit'

export default defineManifest({
  key: 'news',
  version: '1.0.0',
  name: 'News',
  extends: baseManifest,
  tokens: {
    defaults: {
      color: { primary: '#b3261e', surface: '#fffbf5', text: '#1d1b16' },
      font: { heading: 'Merriweather', body: 'Source Sans 3' },
      radius: { card: '2px' },
    },
  },
  options: {
    defaults: { header: { style: 'left', showDate: true } },
  },
  defaultLayouts: {
    home: [
      { type: 'headline-list', props: { source: 'latest', limit: 7 } },
      { type: 'latest-grid', props: { limit: 6 } },
    ],
  },
})
