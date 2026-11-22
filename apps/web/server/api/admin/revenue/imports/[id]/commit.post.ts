// POST { mapping }: tulis batch ke ledger (satu transaksi, savepoint per baris).
// Hasil: inserted / updated / unchanged / skipped / failed + galat per baris.
import { EditorError, importMappingSchema, mapImportRows } from '@framework/core'
import { readBody } from 'nuxt/server'
import { param } from '../../../../../utils/admin-api'
import { defineRevenueHandler } from '../../../../../utils/revenue'

export default defineRevenueHandler(async ({ event, admin, repos }) => {
  const id = param(event, 'id')
  const body = ((await readBody(event)) ?? {}) as { mapping?: unknown }
  const parsed = importMappingSchema.safeParse(body.mapping)
  if (!parsed.success) throw new EditorError('invalid', 'Mapping belum lengkap', parsed.error.issues.map((i) => ({ field: `mapping.${i.path.join('.')}`, message: i.message })))
  const mapping = parsed.data
  const batch = await repos.revenue.getImportBatch(id)
  const source = await repos.revenue.getSourceById(batch.sourceId)
  return repos.revenue.commitImportBatch(id, (b) => ({
    ...mapImportRows(b.rows, mapping, { sourceCode: source?.code ?? 'impor', defaultCurrency: source?.defaultCurrency ?? 'IDR' }),
    mapping,
  }), admin.user.id)
})
