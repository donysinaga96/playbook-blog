// POST { mode: 'missing' } | { mode: 'range', currency, from, to }: isi/hitung ulang konversi.
import { readBody } from 'nuxt/server'
import { EditorError } from '@framework/core'
import { defineRevenueHandler } from '../../../../utils/revenue'

const DATE = /^\d{4}-\d{2}-\d{2}$/

export default defineRevenueHandler(async ({ event, repos }) => {
  const body = ((await readBody(event)) ?? {}) as Record<string, unknown>
  if (body['mode'] === 'range') {
    const currency = String(body['currency'] ?? '')
    const from = String(body['from'] ?? '')
    const to = String(body['to'] ?? '')
    if (!/^[A-Z]{3}$/.test(currency) || !DATE.test(from) || !DATE.test(to) || from > to) throw new EditorError('invalid', 'Isi mata uang dan rentang tanggal yang valid')
    return { updated: await repos.revenue.recomputeFx({ mode: 'range', currency, from, to }) }
  }
  return { updated: await repos.revenue.recomputeFx({ mode: 'missing' }) }
})
