// POST { note, expectedUpdatedAt }: tolak hasil AI (ARCHIVED, alasan wajib).
import { readBody } from 'nuxt/server'
import { defineAdminSiteHandler, param } from '../../../../../../utils/admin-api'
import { useRepositories } from '../../../../../../utils/database'

export default defineAdminSiteHandler(async ({ site, admin, event }) => {
  const body = ((await readBody(event)) ?? {}) as { note?: unknown; expectedUpdatedAt?: unknown }
  return useRepositories().generated.reject(site.id, param(event, 'id'), String(body.note ?? ''), String(body.expectedUpdatedAt ?? ''), admin.user.id)
})
