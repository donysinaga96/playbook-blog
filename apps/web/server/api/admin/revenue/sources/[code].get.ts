// GET /api/admin/revenue/sources/:code?from&to&property: detail satu sumber (metrik, tren, dimensi, run, webhook, impor).
import { getRequestURL } from 'nuxt/server'
import { param } from '../../../../utils/admin-api'
import { defineRevenueHandler, describeSource, readFilters } from '../../../../utils/revenue'

export default defineRevenueHandler(async ({ event, repos, service }) => {
  const code = param(event, 'code')
  const source = await repos.revenue.requireSource(code)
  const filters = readFilters(event, repos.revenueQueries.today())
  const detail = await repos.revenueQueries.sourceDetail(code, { from: filters.from, to: filters.to, statuses: filters.statuses, propertyId: filters.propertyId })
  return { source: describeSource(service, source, getRequestURL(event, { xForwardedProto: true }).origin), detail, range: service.defaultRange(source, repos.revenueQueries.today()) }
})
