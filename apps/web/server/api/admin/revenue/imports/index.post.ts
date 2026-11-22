// POST multipart (file, sourceCode): unggah CSV/Excel/JSON. File di-parse di
// server lalu disimpan sebagai batch "uploaded"; belum ada yang masuk ledger.
// Balasan: kolom, contoh baris, dan usulan mapping untuk wizard.
import { createHash } from 'node:crypto'
import { EditorError, MAX_IMPORT_BYTES, parseImportFile, suggestMapping } from '@framework/core'
import { createError } from 'nuxt/server'
import { defineRevenueHandler } from '../../../../utils/revenue'

export default defineRevenueHandler(async ({ event, admin, repos }) => {
  const length = Number(event.req.headers.get('content-length'))
  if (!Number.isFinite(length) || length <= 0) throw createError({ statusCode: 411, statusMessage: 'Content-Length wajib diisi' })
  if (length > MAX_IMPORT_BYTES + 64 * 1024) throw createError({ statusCode: 413, statusMessage: `File maksimal ${MAX_IMPORT_BYTES / 1024 / 1024} MB` })
  const form = await event.req.formData().catch(() => {
    throw createError({ statusCode: 400, statusMessage: 'Body harus multipart/form-data' })
  })
  const file = form.get('file')
  const sourceCode = String(form.get('sourceCode') ?? '')
  if (!(file instanceof Blob)) throw new EditorError('invalid', 'Pilih file', [{ field: 'file', message: 'Pilih file CSV, Excel, atau JSON' }])
  const source = await repos.revenue.requireSource(sourceCode)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const fileName = (file as File).name || 'impor'
  const table = parseImportFile(fileName, bytes)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const batchId = await repos.revenue.createImportBatch({ sourceId: source.id, fileName, format: table.format, sha256, headers: table.headers, rows: table.rows, userId: admin.user.id })
  return {
    batchId,
    fileName,
    format: table.format,
    headers: table.headers,
    rowCount: table.rows.length,
    sample: table.rows.slice(0, 8),
    suggestion: { ...suggestMapping(table.headers), currencyFixed: source.defaultCurrency },
    sameFile: await repos.revenue.findSameFile(source.id, sha256, batchId),
  }
})
