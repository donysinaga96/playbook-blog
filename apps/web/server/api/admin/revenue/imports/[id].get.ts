// GET: ringkasan satu batch impor (tanpa baris mentah) + galat per baris.
import { param } from '../../../../utils/admin-api'
import { defineRevenueHandler } from '../../../../utils/revenue'

export default defineRevenueHandler(async ({ event, repos }) => {
  const batch: Record<string, unknown> = { ...(await repos.revenue.getImportBatch(param(event, 'id'))) }
  delete batch['rows']
  return batch
})
