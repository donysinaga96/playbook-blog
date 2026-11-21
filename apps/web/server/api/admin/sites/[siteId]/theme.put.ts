// PUT { templateKey, draft, updatedAt }: simpan config tema dan aktifkan.
// Validasi ketat terhadap skema manifest; config ditulis dalam versi
// template terpasang (migrasi config selesai di sini, ADR-008 butir 8).
import { editorErrorMap, EditorError } from '@framework/core'
import { validateThemeDraft } from '@framework/template-kit'
import { readBody } from 'nuxt/server'
import { defineAdminSiteHandler } from '../../../../utils/admin-api'
import { templateManifests } from '../../../../utils/templates'

export default defineAdminSiteHandler(async ({ editor, site, event }) => {
  const body = (await readBody(event)) as { templateKey?: string; draft?: unknown; updatedAt?: string | null } | null
  const key = String(body?.templateKey ?? '')
  if (!templateManifests.has(key)) throw new EditorError('invalid', 'template tidak terdaftar', [{ field: 'templateKey', message: 'template tidak terdaftar' }])
  const manifest = templateManifests.get(key)
  const result = validateThemeDraft(manifest, body?.draft, editorErrorMap)
  if (!result.ok) throw new EditorError('invalid', result.issues.map((i) => `${i.field}: ${i.message}`).join('; '), result.issues)
  return editor.saveTheme(site.id, { templateKey: key, templateVersion: manifest.version, ...result.value }, body?.updatedAt ?? null)
})
