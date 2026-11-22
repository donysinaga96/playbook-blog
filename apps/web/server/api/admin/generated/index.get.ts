// GET ?status=READY_TO_PUBLISH|APPROVED|ARCHIVED&siteId=&page=
// Antrian hasil AI dari semua site milik user (ADR-010, M5a 5a.3), terbaru
// dulu, beserta jumlah yang menunggu per site untuk navigasi admin.
import { GENERATED_STATUSES, type GeneratedStatus } from '@framework/core'
import { createError, defineEventHandler, getQuery } from 'nuxt/server'
import { requireAdmin } from '../../../utils/admin'
import { useRepositories } from '../../../utils/database'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const query = getQuery(event)
  const status = String(query['status'] ?? 'READY_TO_PUBLISH') as GeneratedStatus
  if (!GENERATED_STATUSES.includes(status)) throw createError({ statusCode: 422, statusMessage: 'status tidak dikenal' })
  const allIds = admin.sites.map((s) => s.id)
  const only = query['siteId'] ? String(query['siteId']) : null
  if (only && !allIds.includes(only)) throw createError({ statusCode: 404, statusMessage: 'Site tidak ditemukan' })
  const { generated } = useRepositories()
  const [page, ready] = await Promise.all([
    generated.list(only ? [only] : allIds, { status, page: Number(query['page']) || 1, pageSize: Math.min(50, Number(query['pageSize']) || 20) }),
    generated.countReady(allIds),
  ])
  const sites = new Map(admin.sites.map((s) => [s.id, { id: s.id, code: s.code, name: s.name }]))
  return { ...page, items: page.items.map((i) => ({ ...i, site: sites.get(i.siteId) })), ready }
})
