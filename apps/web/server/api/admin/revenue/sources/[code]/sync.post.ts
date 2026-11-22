// POST { from?, to? }: tarik data sekarang (Adsterra, AdSense, headless). Tanpa rentang = jendela lookback.
import { readBody } from 'nuxt/server'
import { param } from '../../../../../utils/admin-api'
import { defineRevenueHandler } from '../../../../../utils/revenue'

export default defineRevenueHandler(async ({ event, admin, service }) => {
  const body = ((await readBody(event)) ?? {}) as { from?: unknown; to?: unknown }
  const from = typeof body.from === 'string' && body.from ? body.from : undefined
  const to = typeof body.to === 'string' && body.to ? body.to : undefined
  return service.sync(param(event, 'code'), { from, to, trigger: 'manual', userId: admin.user.id })
})
