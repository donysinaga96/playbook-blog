// GET /api/admin/revenue/entries?from&to&sources&statuses&property&q&channel&page&pageSize
import { getQuery } from 'nuxt/server'
import { defineRevenueHandler, readFilters } from '../../../../utils/revenue'

export default defineRevenueHandler(async ({ event, repos }) => {
  const filters = readFilters(event, repos.revenueQueries.today())
  const q = getQuery(event)
  return repos.revenueQueries.listEntries(
    { ...filters, q: typeof q['q'] === 'string' ? q['q'] : undefined, channel: typeof q['channel'] === 'string' ? q['channel'] : undefined },
    { page: Number(q['page']) || 1, pageSize: Number(q['pageSize']) || 25 },
  )
})
