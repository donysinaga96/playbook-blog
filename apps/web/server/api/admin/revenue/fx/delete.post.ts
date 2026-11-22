// POST { currency, rateDate }: hapus satu kurs. Entri yang sudah dikonversi tidak berubah.
import { readBody } from 'nuxt/server'
import { defineRevenueHandler } from '../../../../utils/revenue'

export default defineRevenueHandler(async ({ event, repos }) => {
  const body = ((await readBody(event)) ?? {}) as { currency?: unknown; rateDate?: unknown }
  await repos.revenue.deleteFxRate(String(body.currency ?? ''), String(body.rateDate ?? ''))
  return { ok: true }
})
