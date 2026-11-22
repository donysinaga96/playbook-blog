// POST { mode: 'publish'|'schedule'|'draft', publishAt?, note?, expectedUpdatedAt }:
// pindahkan hasil AI ke tabel konten (satu transaksi, ADR-010).
import { readBody } from 'nuxt/server'
import type { ApproveInput } from '@framework/core'
import { defineAdminSiteHandler, param } from '../../../../../../utils/admin-api'
import { useRepositories } from '../../../../../../utils/database'
import { useMediaStorage } from '../../../../../../utils/media'

export default defineAdminSiteHandler(async ({ site, admin, event }) => {
  const body = ((await readBody(event)) ?? {}) as Partial<ApproveInput>
  const input: ApproveInput = {
    mode: body.mode as ApproveInput['mode'],
    publishAt: typeof body.publishAt === 'string' ? body.publishAt : undefined,
    note: typeof body.note === 'string' ? body.note : undefined,
    expectedUpdatedAt: String(body.expectedUpdatedAt ?? ''),
  }
  return useRepositories().generated.approve(site.id, param(event, 'id'), input, admin.user.id, useMediaStorage())
})
