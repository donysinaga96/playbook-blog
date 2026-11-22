// POST { mapping }: validasi semua baris dengan mapping (tanpa menulis):
// jumlah baris valid, galat per baris, duplikat, perkiraan baru vs sudah ada.
import { importMappingSchema, mapImportRows, EditorError } from '@framework/core'
import { readBody } from 'nuxt/server'
import { param } from '../../../../../utils/admin-api'
import { defineRevenueHandler } from '../../../../../utils/revenue'

export default defineRevenueHandler(async ({ event, repos }) => {
  const batch = await repos.revenue.getImportBatch(param(event, 'id'))
  if (batch.status !== 'uploaded' || !batch.rows) throw new EditorError('conflict', 'Batch ini sudah di-commit atau dibuang')
  const body = ((await readBody(event)) ?? {}) as { mapping?: unknown }
  const parsed = importMappingSchema.safeParse(body.mapping)
  if (!parsed.success) throw new EditorError('invalid', 'Mapping belum lengkap', parsed.error.issues.map((i) => ({ field: `mapping.${i.path.join('.')}`, message: i.message })))
  const missing = [parsed.data.date, parsed.data.amount, parsed.data.currency, parsed.data.externalId, parsed.data.status, parsed.data.description, parsed.data.property, ...Object.values(parsed.data.metrics), ...parsed.data.dimensions]
    .filter((c): c is string => Boolean(c) && !(batch.headers as string[]).includes(c as string))
  if (missing.length) throw new EditorError('invalid', `Kolom tidak ada di file: ${missing.join(', ')}`)
  const source = await repos.revenue.getSourceById(batch.sourceId)
  const result = mapImportRows(batch.rows as Record<string, string>[], parsed.data, { sourceCode: source?.code ?? 'impor', defaultCurrency: source?.defaultCurrency ?? 'IDR' })
  const keys = result.entries.map((e) => e.entry.idempotencyKey)
  const already = await repos.revenue.countExistingKeys(batch.sourceId, keys)
  return {
    rowCount: (batch.rows as unknown[]).length,
    valid: result.entries.length,
    willInsert: result.entries.length - already,
    alreadyInLedger: already,
    errors: result.errors.slice(0, 100),
    errorCount: result.errors.length,
    skipped: result.duplicates.slice(0, 100),
    skippedCount: result.duplicates.length,
    sample: result.entries.slice(0, 12).map((e) => ({ row: e.row, reportDate: e.entry.reportDate, grossAmount: e.entry.grossAmount, currency: e.entry.currency, status: e.entry.status, description: e.entry.description, externalId: e.entry.externalId, propertyDomain: e.entry.propertyDomain })),
    currencies: [...new Set(result.entries.map((e) => e.entry.currency))],
  }
})
