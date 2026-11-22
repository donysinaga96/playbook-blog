// POST { currency, rateDate, rate, note? }: tambah/ubah kurs (1 currency = rate mata uang utama).
import { readBody } from 'nuxt/server'
import { defineRevenueHandler } from '../../../../utils/revenue'

export default defineRevenueHandler(async ({ event, admin, repos }) => {
  await repos.revenue.upsertFxRate(await readBody(event), admin.user.id)
  return { ok: true }
})
