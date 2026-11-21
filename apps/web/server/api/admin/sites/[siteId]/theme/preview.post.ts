// POST { templateKey, draft, draftId? }: simpan draf pratinjau (bukan ke
// database; theme aktif tidak berubah). Mengembalikan URL pratinjau dengan id
// draf, sehingga setiap tab memuat drafnya sendiri (utils/preview-drafts.ts).
import { editorErrorMap, EditorError } from '@framework/core'
import { validateThemeDraft } from '@framework/template-kit'
import { readBody } from 'nuxt/server'
import { defineAdminSiteHandler } from '../../../../../utils/admin-api'
import { savePreviewDraft } from '../../../../../utils/preview-drafts'
import { templateManifests } from '../../../../../utils/templates'
import { PREVIEW_PREFIX } from '../../../../../utils/theme-preview'

export default defineAdminSiteHandler(async ({ event, site, admin }) => {
  const body = (await readBody(event)) as { templateKey?: string; draft?: unknown; draftId?: string } | null
  const key = String(body?.templateKey ?? '')
  if (!templateManifests.has(key)) throw new EditorError('invalid', 'template tidak terdaftar', [{ field: 'templateKey', message: 'template tidak terdaftar' }])
  const result = validateThemeDraft(templateManifests.get(key), body?.draft, editorErrorMap)
  if (!result.ok) throw new EditorError('invalid', result.issues.map((i) => `${i.field}: ${i.message}`).join('; '), result.issues)
  const draftId = savePreviewDraft({ userId: admin.user.id, siteId: site.id, templateKey: key, ...result.value }, body?.draftId)
  return { draftId, base: `${PREVIEW_PREFIX}${site.code}` }
})
