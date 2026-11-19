// Template magazine 1.0.0: tampilan majalah yang dibangun hanya dari token,
// opsi, dan CSS di atas komponen base. Tidak ada override komponen (ADR-005).
import { defineTemplate } from '@framework/template-kit'
import base from '@framework/template-base'
import './styles.css'

export default defineTemplate({
  key: 'magazine',
  version: '1.0.0',
  name: 'Magazine',
  extends: base,
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
})
