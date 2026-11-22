// PUT { name?, isActive?, defaultCurrency?, syncIntervalMinutes?, lookbackDays?, config?, updatedAt }.
// config hanya non-rahasia (divalidasi per connector); kunci yang mirip rahasia ditolak.
import { readBody } from 'nuxt/server'
import { param } from '../../../../utils/admin-api'
import { defineRevenueHandler } from '../../../../utils/revenue'

export default defineRevenueHandler(async ({ event, repos }) => repos.revenue.updateSource(param(event, 'code'), await readBody(event)))
