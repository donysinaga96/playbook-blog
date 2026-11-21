// Template news: tampilan harian berita di atas komponen base, tanpa
// override komponen (ADR-005). Manifest ada di ./manifest.ts (ADR-008).
import base from '@framework/template-base'
import { defineTemplate } from '@framework/template-kit'
import manifest from './manifest'
import './styles.css'

export default defineTemplate({ manifest, extends: base })
