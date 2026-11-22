// Column mapping impor: kolom file -> field ledger, validasi per baris, dan
// kunci idempotensi. Hasilnya dipakai dua kali dengan data yang sama:
// preview (tanpa menulis) dan commit (upsert ke ledger).
//
// Kunci idempotensi:
//   kolom ID dipetakan -> <sumber>:ext:<id>     (impor ulang = update/unchanged)
//   tanpa kolom ID     -> <sumber>:row:<hash isi baris>
// Baris yang kuncinya sama di dalam satu file dilewati ("duplikat di file").
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { isIsoDate } from '../dates'
import { DecimalError, negate, parseAmountText } from '../decimal'
import { normalizeDomain } from '../ledger-rules'
import type { LedgerInput, LedgerStatus } from '../types'

const column = z.string().min(1).max(200)

export const importMappingSchema = z.object({
  date: column,
  amount: column,
  currency: column.nullish(),
  /** Mata uang tetap bila file tidak punya kolom mata uang. */
  currencyFixed: z.string().regex(/^[A-Z]{3}$/).nullish(),
  externalId: column.nullish(),
  status: column.nullish(),
  statusFixed: z.enum(['estimated', 'finalized']).default('finalized'),
  description: column.nullish(),
  /** Kolom berisi domain/URL situs, dipetakan ke revenue_properties. */
  property: column.nullish(),
  /** Properti tetap untuk semua baris (id revenue_properties). */
  propertyId: z.uuid().nullish(),
  metrics: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/), column).default({}),
  dimensions: z.array(column).max(10).default([]),
  dateFormat: z.enum(['auto', 'YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY']).default('auto'),
  decimalSeparator: z.enum(['.', ',']).default('.'),
})

export type ImportMapping = z.infer<typeof importMappingSchema>
export type ImportMappingInput = z.input<typeof importMappingSchema>

export interface RowError {
  /** Nomor baris data (1 = baris pertama setelah header). */
  row: number
  message: string
}

export interface MappedRow {
  row: number
  entry: LedgerInput
}

export interface MappingResult {
  entries: MappedRow[]
  errors: RowError[]
  /** Baris yang dilewati karena duplikat di dalam file yang sama. */
  duplicates: RowError[]
}

const SYNONYMS: Record<'date' | 'amount' | 'currency' | 'externalId' | 'status' | 'description' | 'property', string[]> = {
  date: ['date', 'tanggal', 'tgl', 'report date', 'day', 'created at', 'created_at', 'paid at', 'paid_at', 'transaction date', 'waktu'],
  amount: ['amount', 'revenue', 'earnings', 'estimated earnings', 'net', 'net amount', 'total', 'grand total', 'pendapatan', 'nominal', 'jumlah', 'income', 'payout'],
  currency: ['currency', 'mata uang', 'currency code', 'ccy'],
  externalId: ['id', 'payment id', 'payment_id', 'order id', 'order_id', 'transaction id', 'transaction_id', 'ref id', 'refid', 'invoice', 'receipt id'],
  status: ['status', 'payment status', 'state'],
  description: ['description', 'deskripsi', 'product', 'produk', 'item', 'title', 'judul', 'plan', 'keterangan', 'note'],
  property: ['domain', 'site', 'website', 'situs', 'web', 'url'],
}

/** Usulan mapping dari nama kolom (dicocokkan tanpa huruf besar/kecil dan tanda baca). */
export function suggestMapping(headers: string[]): Partial<ImportMappingInput> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const pick = (names: string[]) => {
    const wanted = names.map(norm)
    return headers.find((h) => wanted.includes(norm(h))) ?? headers.find((h) => wanted.some((w) => norm(h).includes(w))) ?? null
  }
  const out: Partial<ImportMappingInput> = {}
  for (const [field, names] of Object.entries(SYNONYMS)) {
    const found = pick(names)
    if (found) (out as Record<string, string>)[field] = found
  }
  // Kolom yang sama tidak boleh dipakai dua field (mis. "Amount" untuk ID).
  if (out.externalId && (out.externalId === out.amount || out.externalId === out.date)) delete out.externalId
  if (out.description && out.description === out.status) delete out.description
  const metricCandidates: Record<string, string[]> = { impressions: ['impressions', 'impression', 'tayangan'], clicks: ['clicks', 'klik'], pageViews: ['page views', 'pageviews'], orders: ['orders', 'order count', 'quantity', 'qty'] }
  const metrics: Record<string, string> = {}
  for (const [key, names] of Object.entries(metricCandidates)) {
    const found = headers.find((h) => names.includes(norm(h)))
    if (found) metrics[key] = found
  }
  if (Object.keys(metrics).length) out.metrics = metrics
  return out
}

/** Excel menyimpan tanggal sebagai nomor seri (hari sejak 1899-12-30). */
function excelSerialToDate(serial: number): string {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000).toISOString().slice(0, 10)
}

export function parseDateText(raw: string, format: ImportMapping['dateFormat']): string | null {
  const text = raw.trim()
  if (!text) return null
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    const d = excelSerialToDate(Number(text))
    return isIsoDate(d) ? d : null
  }
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(text)
  if (iso && (format === 'auto' || format === 'YYYY-MM-DD')) {
    const d = `${iso[1]}-${iso[2]?.padStart(2, '0')}-${iso[3]?.padStart(2, '0')}`
    return isIsoDate(d) ? d : null
  }
  const slash = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T].*)?$/.exec(text)
  if (slash) {
    const [a, b, y] = [slash[1] ?? '', slash[2] ?? '', slash[3] ?? '']
    let day: string
    let month: string
    if (format === 'MM/DD/YYYY') [month, day] = [a, b]
    else if (format === 'DD/MM/YYYY') [day, month] = [a, b]
    else if (Number(a) > 12) [day, month] = [a, b]
    else if (Number(b) > 12) [month, day] = [a, b]
    else return null // ambigu (mis. 03/04/2026): pilih format tanggal secara eksplisit
    const d = `${y}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    return isIsoDate(d) ? d : null
  }
  return null
}

const STATUS_WORDS: Record<string, LedgerStatus | 'skip'> = {
  final: 'finalized', finalized: 'finalized', paid: 'finalized', completed: 'finalized', complete: 'finalized', success: 'finalized', succeeded: 'finalized', settled: 'finalized', lunas: 'finalized', berhasil: 'finalized', sukses: 'finalized',
  estimated: 'estimated', pending: 'estimated', processing: 'estimated', sementara: 'estimated',
  refunded: 'refunded', refund: 'refunded', chargeback: 'refunded', disputed: 'refunded',
  failed: 'skip', canceled: 'skip', cancelled: 'skip', void: 'skip', gagal: 'skip', batal: 'skip',
}

export function mapImportRows(rows: Record<string, string>[], mapping: ImportMapping, options: { sourceCode: string; defaultCurrency: string }): MappingResult {
  const entries: MappedRow[] = []
  const errors: RowError[] = []
  const duplicates: RowError[] = []
  const seen = new Map<string, number>()

  rows.forEach((row, i) => {
    const rowNumber = i + 1
    const get = (col: string | null | undefined) => (col ? (row[col] ?? '').trim() : '')
    const problems: string[] = []

    const reportDate = parseDateText(get(mapping.date), mapping.dateFormat)
    if (!reportDate) problems.push(`tanggal "${get(mapping.date)}" tidak dikenali`)

    let amount: string | null = null
    try {
      amount = parseAmountText(get(mapping.amount), mapping.decimalSeparator)
    } catch (e) {
      problems.push(e instanceof DecimalError ? `nominal: ${e.message}` : 'nominal tidak valid')
    }

    const currency = (get(mapping.currency) || mapping.currencyFixed || options.defaultCurrency).toUpperCase()
    if (!/^[A-Z]{3}$/.test(currency)) problems.push(`mata uang "${currency}" bukan kode ISO 3 huruf`)

    let status: LedgerStatus = mapping.statusFixed
    const statusText = get(mapping.status).toLowerCase()
    if (statusText) {
      const mapped = STATUS_WORDS[statusText]
      if (mapped === 'skip') {
        duplicates.push({ row: rowNumber, message: `status "${statusText}" bukan pemasukan; dilewati` })
        return
      }
      if (!mapped) problems.push(`status "${statusText}" tidak dikenal`)
      else status = mapped
    }

    if (problems.length || !reportDate || amount === null) {
      errors.push({ row: rowNumber, message: problems.join('; ') })
      return
    }

    if (status === 'refunded' && !amount.startsWith('-')) amount = amount === '0' ? amount : negate(amount)
    if (status === 'refunded' && amount === '0') {
      errors.push({ row: rowNumber, message: 'refund dengan nominal 0' })
      return
    }

    const metrics: Record<string, number> = {}
    for (const [key, col] of Object.entries(mapping.metrics)) {
      const raw = get(col)
      if (!raw) continue
      const n = Number(raw.replace(/[\s,]/g, ''))
      if (Number.isFinite(n)) metrics[key] = n
    }
    const dimensions: Record<string, string> = {}
    for (const col of mapping.dimensions) {
      const v = get(col)
      if (v) dimensions[col.slice(0, 60)] = v.slice(0, 200)
    }
    const propertyText = get(mapping.property)
    if (propertyText) dimensions['domain'] = propertyText.slice(0, 200)
    const description = get(mapping.description).slice(0, 500) || null
    const externalId = get(mapping.externalId).slice(0, 200) || null

    const key = externalId
      ? `${options.sourceCode}:ext:${externalId}${status === 'refunded' ? ':refund' : ''}`
      : `${options.sourceCode}:row:${createHash('sha256').update(JSON.stringify([reportDate, amount, currency, status, description, propertyText, dimensions])).digest('hex').slice(0, 32)}`

    const first = seen.get(key)
    if (first !== undefined) {
      duplicates.push({ row: rowNumber, message: `duplikat baris ${first} di file yang sama` })
      return
    }
    seen.set(key, rowNumber)

    entries.push({
      row: rowNumber,
      entry: {
        idempotencyKey: key,
        externalId,
        reportDate,
        grossAmount: amount,
        currency,
        status,
        metrics,
        dimensions,
        description,
        note: status === 'refunded' ? 'Refund dari file impor' : null,
        rawPayload: row,
        propertyDomain: normalizeDomain(propertyText),
        propertyId: mapping.propertyId ?? null,
      },
    })
  })

  return { entries, errors, duplicates }
}
