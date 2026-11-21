// GET: template yang bisa dipakai site + config untuk form (M4 4.4).
//
// Untuk setiap template terdaftar: deskripsi form (JSON Schema dari manifest)
// dan nilai awal. Config tersimpan dimigrasi dan divalidasi seperti saat
// render (resolveTheme), jadi form selalu dibuka dengan bentuk versi
// terpasang. layouts.home: tidak ada = bawaan template, [] = tanpa section.
import { describeTemplate, isPlainObject, SECTION_LIMITS } from '@framework/template-kit'
import { defineAdminSiteHandler } from '../../../../utils/admin-api'
import { templateManifests } from '../../../../utils/templates'

export default defineAdminSiteHandler(async ({ editor, site }) => {
  const stored = await editor.listThemes(site.id)
  const activeStored = stored.find((t) => t.isActive)?.templateKey
  return {
    // Template aktif yang sudah tidak terdaftar: site tampil dengan fallback, form juga.
    activeKey: activeStored && templateManifests.has(activeStored) ? activeStored : templateManifests.fallback.key,
    limits: { maxSectionsPerPage: SECTION_LIMITS.maxSectionsPerPage },
    templates: templateManifests.templates.map((manifest) => {
      const row = stored.find((t) => t.templateKey === manifest.key) ?? null
      // Belum pernah disimpan: bawaan template ITU (resolveTheme(null) = fallback/base).
      const resolved = templateManifests.resolveTheme(row ?? { templateKey: manifest.key, templateVersion: manifest.version, tokens: manifest.tokens.defaults, options: manifest.options.defaults })
      const hasHome = row && isPlainObject(row.layouts) && Object.hasOwn(row.layouts, 'home')
      return {
        ...describeTemplate(manifest),
        stored: row ? { templateVersion: row.templateVersion, isActive: row.isActive, updatedAt: row.updatedAt } : null,
        config: {
          tokens: resolved.tokens,
          options: resolved.options,
          layouts: hasHome ? { home: resolved.layouts.home.map((s) => ({ type: s.type, props: s.props })) } : {},
        },
        issues: resolved.issues,
      }
    }),
  }
})
