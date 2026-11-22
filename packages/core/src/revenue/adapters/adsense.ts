// Adapter Google AdSense Management API v2 (pull terjadwal, OAuth 2.0
// scope https://www.googleapis.com/auth/adsense.readonly).
//
//   token   POST https://oauth2.googleapis.com/token (grant_type=refresh_token)
//   laporan GET  https://adsense.googleapis.com/v2/{account}/reports:generate
//           dateRange=CUSTOM, startDate.year/month/day, endDate.*,
//           dimensions=DATE&dimensions=DOMAIN_NAME, metrics=..., reportingTimeZone,
//           currencyCode (opsional), limit
//   respons { totalMatchedRows, headers: [{ name, type, currencyCode? }],
//             rows: [{ cells: [{ value }] }], warnings?, startDate, endDate }
//
// Parsing digerakkan header: posisi kolom dibaca dari `headers`, bukan
// diasumsikan, sehingga urutan metrik yang berbeda tetap terbaca benar.
// Mata uang diambil dari header bertipe METRIC_CURRENCY. Bila
// totalMatchedRows lebih besar dari jumlah baris, laporan terpotong ->
// gagal dengan pesan jelas (tidak pernah menyimpan data yang terpotong diam-diam).
//
// Status: earnings AdSense final setelah bulan ditutup (awal bulan
// berikutnya). Bulan berjalan = estimated; bulan lalu = finalized mulai
// tanggal `finalizeDay` bulan ini; lebih lama = finalized.
import { z } from 'zod'
import { monthIndex } from '../dates'
import { toDecimal } from '../decimal'
import { normalizeDomain } from '../ledger-rules'
import { RevenueError, type LedgerInput, type LedgerStatus } from '../types'
import type { FetchLike } from './adsterra'

export const ADSENSE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const ADSENSE_API_BASE = 'https://adsense.googleapis.com/v2'
export const ADSENSE_SCOPE = 'https://www.googleapis.com/auth/adsense.readonly'

export const ADSENSE_METRICS = [
  'ESTIMATED_EARNINGS',
  'PAGE_VIEWS',
  'CLICKS',
  'IMPRESSIONS',
  'PAGE_VIEWS_RPM',
  'IMPRESSIONS_RPM',
  'COST_PER_CLICK',
] as const

/** Nama metrik AdSense -> kunci metrics_json. */
const METRIC_KEYS: Record<string, string> = {
  PAGE_VIEWS: 'pageViews',
  CLICKS: 'clicks',
  IMPRESSIONS: 'impressions',
  PAGE_VIEWS_RPM: 'pageViewsRpm',
  IMPRESSIONS_RPM: 'impressionsRpm',
  COST_PER_CLICK: 'cpc',
  AD_REQUESTS: 'adRequests',
  PAGE_VIEWS_CTR: 'pageViewsCtr',
}

const reportSchema = z.looseObject({
  totalMatchedRows: z.union([z.string(), z.number()]).optional(),
  headers: z.array(z.looseObject({ name: z.string(), type: z.string(), currencyCode: z.string().optional() })),
  rows: z.array(z.looseObject({ cells: z.array(z.looseObject({ value: z.string().optional() })) })).optional(),
  warnings: z.array(z.string()).optional(),
})

export type AdsenseReport = z.infer<typeof reportSchema>

export interface ParsedAdsenseReport {
  /** Satu object per baris: nama header -> nilai teks. */
  rows: Record<string, string>[]
  /** Mata uang metrik uang (dari header METRIC_CURRENCY). */
  currencyCode: string | null
  totalMatchedRows: number
  warnings: string[]
}

/** Parse respons reports:generate berdasarkan header; lempar bila terpotong atau tanpa kolom wajib. */
export function parseAdsenseReport(json: unknown): ParsedAdsenseReport {
  const parsed = reportSchema.safeParse(json)
  if (!parsed.success) throw new RevenueError('respons laporan AdSense tidak dikenali (headers/rows)')
  const report = parsed.data
  const names = report.headers.map((h) => h.name)
  const currencyHeaders = report.headers.filter((h) => h.type === 'METRIC_CURRENCY' && h.currencyCode)
  const currencies = new Set(currencyHeaders.map((h) => h.currencyCode))
  if (currencies.size > 1) throw new RevenueError(`laporan AdSense memuat lebih dari satu mata uang: ${[...currencies].join(', ')}`)
  const rows = (report.rows ?? []).map((row, index) => {
    if (row.cells.length !== names.length) {
      throw new RevenueError(`baris ${index + 1} laporan AdSense punya ${row.cells.length} sel, header ${names.length}`)
    }
    const out: Record<string, string> = {}
    names.forEach((name, i) => {
      out[name] = row.cells[i]?.value ?? ''
    })
    return out
  })
  const total = Number(report.totalMatchedRows ?? rows.length)
  if (Number.isFinite(total) && total > rows.length) {
    throw new RevenueError(`laporan AdSense terpotong: ${rows.length} dari ${total} baris. Perkecil rentang tanggal atau naikkan limit.`)
  }
  return { rows, currencyCode: currencyHeaders[0]?.currencyCode ?? null, totalMatchedRows: total, warnings: report.warnings ?? [] }
}

export function adsenseStatus(reportDate: string, today: string, finalizeDay: number): LedgerStatus {
  const age = monthIndex(today) - monthIndex(reportDate)
  if (age >= 2) return 'finalized'
  if (age === 1) return Number(today.slice(8, 10)) >= finalizeDay ? 'finalized' : 'estimated'
  return 'estimated'
}

/**
 * Baris laporan -> entri ledger (satu per tanggal per domain). Kolom wajib:
 * DATE dan ESTIMATED_EARNINGS. DOMAIN_NAME opsional (tanpa itu: per akun).
 */
export function adsenseToLedger(report: ParsedAdsenseReport, options: { today: string; finalizeDay: number; fallbackCurrency: string }): LedgerInput[] {
  if (report.rows.length && !('DATE' in (report.rows[0] ?? {}))) throw new RevenueError('laporan AdSense tanpa dimensi DATE')
  if (report.rows.length && !('ESTIMATED_EARNINGS' in (report.rows[0] ?? {}))) throw new RevenueError('laporan AdSense tanpa metrik ESTIMATED_EARNINGS')
  const currency = report.currencyCode ?? options.fallbackCurrency
  return report.rows.map((row) => {
    const date = row['DATE'] ?? ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RevenueError(`tanggal AdSense tidak dikenali: "${date}"`)
    const domain = row['DOMAIN_NAME'] || null
    const metrics: Record<string, number> = {}
    for (const [name, key] of Object.entries(METRIC_KEYS)) {
      const value = row[name]
      if (value !== undefined && value !== '' && Number.isFinite(Number(value))) metrics[key] = Number(value)
    }
    return {
      idempotencyKey: `adsense:${date}:${domain ?? '-'}`,
      reportDate: date,
      grossAmount: toDecimal(row['ESTIMATED_EARNINGS'] || '0'),
      currency,
      status: adsenseStatus(date, options.today, options.finalizeDay),
      metrics,
      dimensions: (domain ? { domain } : {}) as Record<string, string>,
      description: domain ? `AdSense ${domain}` : 'AdSense',
      propertyDomain: normalizeDomain(domain),
    }
  })
}

export interface AdsenseClientOptions {
  clientId: string
  clientSecret: string
  refreshToken: string
  fetch: FetchLike
  timeoutMs?: number
}

export function createAdsenseClient(options: AdsenseClientOptions) {
  const timeout = () => AbortSignal.timeout(options.timeoutMs ?? 30_000)

  async function accessToken(): Promise<string> {
    const res = await options.fetch(ADSENSE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: options.clientId,
        client_secret: options.clientSecret,
        refresh_token: options.refreshToken,
      }).toString(),
      signal: timeout(),
    })
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string }
    if (!res.ok || !body.access_token) {
      throw new RevenueError(`OAuth AdSense gagal (HTTP ${res.status}): ${body.error ?? ''} ${body.error_description ?? ''}`.trim())
    }
    return body.access_token
  }

  return {
    accessToken,

    async generateReport(input: { account: string; start: string; end: string; dimensions: string[]; metrics: readonly string[]; reportingTimeZone?: string; currencyCode?: string | null; limit?: number }): Promise<unknown> {
      if (!/^accounts\/pub-\d+$/.test(input.account)) throw new RevenueError('accountId AdSense harus berbentuk accounts/pub-XXXXXXXX')
      const token = await accessToken()
      const query = new URLSearchParams({ dateRange: 'CUSTOM' })
      const [sy, sm, sd] = input.start.split('-')
      const [ey, em, ed] = input.end.split('-')
      query.set('startDate.year', String(Number(sy)))
      query.set('startDate.month', String(Number(sm)))
      query.set('startDate.day', String(Number(sd)))
      query.set('endDate.year', String(Number(ey)))
      query.set('endDate.month', String(Number(em)))
      query.set('endDate.day', String(Number(ed)))
      for (const d of input.dimensions) query.append('dimensions', d)
      for (const m of input.metrics) query.append('metrics', m)
      query.set('reportingTimeZone', input.reportingTimeZone ?? 'ACCOUNT_TIME_ZONE')
      if (input.currencyCode) query.set('currencyCode', input.currencyCode)
      query.set('limit', String(input.limit ?? 10_000))
      query.append('orderBy', '+DATE')
      const res = await options.fetch(`${ADSENSE_API_BASE}/${input.account}/reports:generate?${query.toString()}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: timeout(),
      })
      if (!res.ok) {
        const text = (await res.text().catch(() => '')).slice(0, 300)
        throw new RevenueError(`laporan AdSense HTTP ${res.status}: ${text}`)
      }
      return res.json()
    },
  }
}
