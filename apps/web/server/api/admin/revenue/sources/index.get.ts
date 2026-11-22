// GET /api/admin/revenue/sources: semua sumber + status kredensial (tanpa nilai), mode mock, URL webhook.
import { getRequestURL } from 'nuxt/server'
import { defineRevenueHandler, describeSource } from '../../../../utils/revenue'

export default defineRevenueHandler(async ({ event, repos, service }) => {
  const origin = getRequestURL(event, { xForwardedProto: true }).origin
  const [sources, properties] = await Promise.all([repos.revenue.listSources(), repos.revenue.listProperties()])
  return { sources: sources.map((s) => describeSource(service, s, origin)), properties, settings: repos.revenue.settings, headlessEnabled: process.env['REVENUE_HEADLESS_ENABLED'] === 'true', schedulerEnabled: process.env['REVENUE_SCHEDULER'] === 'true' }
})
