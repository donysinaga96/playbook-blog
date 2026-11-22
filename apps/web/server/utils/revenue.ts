// Dashboard pendapatan (ADR-011) di server: service per proses dan
// pembungkus route /api/admin/revenue/*.
//
// Data pendapatan lintas situs, jadi hanya superadmin (users.is_superadmin)
// yang boleh membaca/menulis. User lain mendapat 404 agar keberadaan fitur
// tidak terbaca. Kredensial sumber hanya dibaca dari env di sini (server);
// tidak ada route yang mengembalikan nilainya, hanya nama env var yang belum diisi.
import { createRevenueService, EditorError, RevenueError, type RevenueService } from '@framework/core'
import { createError, defineEventHandler, getQuery, type RequestEvent } from 'nuxt/server'
import { requireAdmin, type AdminContext } from './admin'
import { toHttpError } from './admin-api'
import { useRepositories } from './database'

let service: RevenueService | undefined

export function useRevenueService(): RevenueService {
  const repos = useRepositories()
  service ??= createRevenueService({ revenue: repos.revenue, queries: repos.revenueQueries }, {
    env: process.env,
    fetch: (input, init) => fetch(input, init),
    now: () => new Date(),
  })
  return service
}

export interface RevenueContext {
  event: RequestEvent
  admin: AdminContext
  service: RevenueService
  repos: ReturnType<typeof useRepositories>
}

/** Sesi admin + superadmin; selain itu 404. */
export async function requireRevenueAdmin(event: RequestEvent): Promise<AdminContext> {
  const admin = await requireAdmin(event)
  if (!admin.user.isSuperadmin) throw createError({ statusCode: 404, statusMessage: 'Tidak ditemukan' })
  return admin
}

export function defineRevenueHandler<T>(handler: (ctx: RevenueContext) => Promise<T>) {
  return defineEventHandler(async (event) => {
    const admin = await requireRevenueAdmin(event)
    try {
      return await handler({ event, admin, service: useRevenueService(), repos: useRepositories() })
    } catch (error) {
      if (error instanceof RevenueError) throw createError({ statusCode: 422, statusMessage: error.message, data: { kind: 'invalid', issues: [] } })
      if (error instanceof Error && /rentang/.test(error.message) && !(error instanceof EditorError)) {
        throw createError({ statusCode: 422, statusMessage: error.message, data: { kind: 'invalid', issues: [] } })
      }
      throw toHttpError(error)
    }
  })
}

const LIST = /^[a-z0-9_,]*$/

/** Filter umum dari query string: from, to, sources=a,b, statuses=x,y, property. */
export function readFilters(event: RequestEvent, today: string) {
  const q = getQuery(event)
  const text = (k: string) => (typeof q[k] === 'string' ? (q[k] as string) : '')
  const list = (k: string) => (LIST.test(text(k)) ? text(k).split(',').filter(Boolean) : [])
  const from = /^\d{4}-\d{2}-\d{2}$/.test(text('from')) ? text('from') : addDaysIso(today, -29)
  const to = /^\d{4}-\d{2}-\d{2}$/.test(text('to')) ? text('to') : today
  const property = text('property')
  return {
    from,
    to,
    sources: list('sources'),
    statuses: list('statuses') as ('estimated' | 'finalized' | 'adjusted' | 'refunded')[],
    propertyId: property === 'none' || /^[0-9a-f-]{36}$/i.test(property) ? property : null,
  }
}

function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Info sumber untuk UI: tanpa nilai rahasia; hanya status kredensial, mode mock, dan URL webhook. */
export function describeSource(svc: RevenueService, source: Parameters<RevenueService['credentialStatus']>[0], origin: string) {
  return {
    ...source,
    mock: svc.isMock(source),
    credentials: svc.credentialStatus(source),
    webhookUrl: source.connector === 'lynk' ? `${origin}/api/webhooks/revenue/${source.code}` : null,
    canSync: ['adsterra', 'adsense', 'headless'].includes(source.connector),
  }
}
