// Pembungkus route API admin per site (ADR-009, M4 4.2):
//   /api/admin/sites/:siteId/...
// requireAdmin (sesi + user ACTIVE), requireSite (site milik user; selain
// itu 404), lalu galat editor dipetakan ke HTTP:
//   EditorError not-found -> 404, conflict -> 409, invalid -> 422 (+ issues)
import { EditorError, type AdminSite, type EditorRepository } from '@framework/core'
import { createError, defineEventHandler, getRouterParam, type RequestEvent } from 'nuxt/server'
import { requireAdmin, requireSite, type AdminContext } from './admin'
import { useRepositories } from './database'

export interface AdminSiteContext {
  event: RequestEvent
  admin: AdminContext
  site: AdminSite
  editor: EditorRepository
}

const STATUS = { 'not-found': 404, conflict: 409, invalid: 422 } as const

export function defineAdminSiteHandler<T>(handler: (ctx: AdminSiteContext) => Promise<T>) {
  return defineEventHandler(async (event) => {
    const admin = await requireAdmin(event)
    const site = requireSite(admin, getRouterParam(event, 'siteId'))
    try {
      return await handler({ event, admin, site, editor: useRepositories().editor })
    } catch (error) {
      throw toHttpError(error)
    }
  })
}

/** EditorError -> galat HTTP (404/409/422 + issues); galat lain dikembalikan apa adanya. */
export function toHttpError(error: unknown): unknown {
  if (error instanceof EditorError) {
    return createError({ statusCode: STATUS[error.kind], statusMessage: error.message, data: { kind: error.kind, issues: error.issues } })
  }
  return error
}

/** Parameter route wajib (mis. :id); kosong = 404. */
export function param(event: RequestEvent, name: string): string {
  const value = getRouterParam(event, name)
  if (!value) throw createError({ statusCode: 404, statusMessage: 'Tidak ditemukan' })
  return value
}
