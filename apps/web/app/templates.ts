// Registry template (manifest + komponen) yang di-bundle aplikasi ini.
// Menambah template = daftar di sini, di server/utils/templates.ts (entry
// ./manifest, ADR-008), dan dependency di package.json; core tidak berubah
// (ADR-005).
// Mode single-site nanti cukup mendaftarkan template yang dipakai (env
// TEMPLATES, ADR-001) agar bundle kecil.
import base from '@framework/template-base'
import { createTemplateRegistry } from '@framework/template-kit'
import magazine from '@framework/template-magazine'

export const templateRegistry = createTemplateRegistry([base, magazine], { fallback: 'base' })
