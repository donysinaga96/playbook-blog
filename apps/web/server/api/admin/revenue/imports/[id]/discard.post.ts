// POST: buang batch yang belum di-commit (baris hasil parse ikut dihapus).
import { param } from '../../../../../utils/admin-api'
import { defineRevenueHandler } from '../../../../../utils/revenue'

export default defineRevenueHandler(async ({ event, repos }) => {
  await repos.revenue.discardImportBatch(param(event, 'id'))
  return { ok: true }
})
