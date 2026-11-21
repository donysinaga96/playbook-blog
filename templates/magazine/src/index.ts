// Template magazine: tampilan majalah yang dibangun hanya dari token, opsi,
// layout section, dan CSS di atas komponen base. Tidak ada override
// komponen (ADR-005). Manifest ada di ./manifest.ts (ADR-008).
import base from '@framework/template-base'
import { defineTemplate } from '@framework/template-kit'
import manifest from './manifest'
import './styles.css'

export default defineTemplate({ manifest, extends: base })
