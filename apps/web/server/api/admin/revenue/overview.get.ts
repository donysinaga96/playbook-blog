// GET /api/admin/revenue/overview?from&to&sources&statuses&property&granularity
// KPI, tren per sumber, per situs, per status, aktivitas terbaru, dan
// kesehatan konektor dalam satu respons (satu filter untuk seluruh dashboard).
import { getQuery, getRequestURL } from 'nuxt/server'
import { defineRevenueHandler, describeSource, readFilters } from '../../../utils/revenue'

export default defineRevenueHandler(async ({ event, repos, service }) => {
  const today = repos.revenueQueries.today()
  const filters = readFilters(event, today)
  const g = getQuery(event)['granularity']
  const granularity = g === 'week' || g === 'month' ? g : 'day'
  const origin = getRequestURL(event, { xForwardedProto: true }).origin
  const [overview, recent, health, sources, properties] = await Promise.all([
    repos.revenueQueries.overview(filters, granularity),
    repos.revenueQueries.recent({ sources: filters.sources, propertyId: filters.propertyId }, 10),
    repos.revenueQueries.health(),
    repos.revenue.listSources(),
    repos.revenue.listProperties(),
  ])
  return {
    granularity,
    overview,
    recent,
    health,
    sources: sources.map((s) => describeSource(service, s, origin)),
    properties,
    settings: repos.revenue.settings,
  }
})
