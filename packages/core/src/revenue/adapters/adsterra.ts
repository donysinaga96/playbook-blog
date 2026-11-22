// Adapter Adsterra Publisher API v3 (pull terjadwal). Kontrak dari spec
// OpenAPI resmi (docs.adsterratools.com/docs/public/v3/publishers-api.yml,
// dibaca 22 Nov 2026):
//   base     https://api3.adsterratools.com/publisher
//   auth     header X-API-Key
//   GET /domains.json                 -> { items: [{ id, title }] }
//   GET /stats.json?start_date&finish_date&group_by[]=date&group_by[]=domain&group_by[]=placement
//            (group_by 1-3 nilai dari date|domain|placement|country|placement_sub_id;
//             rentang maksimum 366 hari)
//            -> { items: [{ date, domain, placement, impression, clicks, ctr, cpm, revenue }], itemCount, dbDateTime }
// Revenue dalam USD. Kolom `domain` di stats adalah ID domain; nama domain
// diambil dari /domains.json lalu dipetakan ke revenue_properties.
//
// Idempotensi: kunci = adsterra:<tanggal>:<domain>:<placement>[:<country>][:<sub_id>]
// sehingga sync ulang (lookback) meng-upsert baris yang sama, dan angka yang
// direvisi Adsterra tercatat sebagai revisi.
import { z } from 'zod'
import { daysBetween } from '../dates'
import { toDecimal } from '../decimal'
import { normalizeDomain, statusByLookback } from '../ledger-rules'
import { RevenueError, type LedgerInput } from '../types'

export const ADSTERRA_BASE_URL = 'https://api3.adsterratools.com/publisher'
export const ADSTERRA_GROUPS = ['date', 'domain', 'placement', 'country', 'placement_sub_id'] as const
export type AdsterraGroup = (typeof ADSTERRA_GROUPS)[number]

export type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  ok: boolean
  status: number
  json(): Promise<unknown>
  text(): Promise<string>
}>

const id = z.union([z.number(), z.string()]).transform((v) => String(v))
const numeric = z.union([z.number(), z.string()]).transform((v) => Number(v)).pipe(z.number().finite())

const statsSchema = z.looseObject({
  items: z.array(z.looseObject({
    date: z.string().optional(),
    domain: id.optional(),
    placement: id.optional(),
    country: z.string().optional(),
    placement_sub_id: z.string().optional(),
    impression: numeric.optional(),
    clicks: numeric.optional(),
    ctr: numeric.optional(),
    cpm: numeric.optional(),
    revenue: z.union([z.number(), z.string()]),
  })),
  itemCount: z.number().optional(),
  dbDateTime: z.string().optional(),
  dbLastUpdateTime: z.string().optional(),
})

const domainsSchema = z.looseObject({
  items: z.array(z.looseObject({ id, title: z.string() })),
})

export type AdsterraStats = z.infer<typeof statsSchema>

export interface AdsterraClientOptions {
  token: string
  fetch: FetchLike
  baseUrl?: string
  timeoutMs?: number
}

export function createAdsterraClient(options: AdsterraClientOptions) {
  const base = (options.baseUrl ?? ADSTERRA_BASE_URL).replace(/\/$/, '')

  async function get(path: string, query: URLSearchParams | null): Promise<unknown> {
    const url = `${base}${path}${query ? `?${query.toString()}` : ''}`
    const res = await options.fetch(url, {
      headers: { 'X-API-Key': options.token, Accept: 'application/json' },
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    })
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 300)
      const hint = res.status === 401 || res.status === 403 ? ' (periksa API token Adsterra)' : res.status === 422 ? ' (parameter ditolak)' : ''
      throw new RevenueError(`Adsterra ${path} HTTP ${res.status}${hint}: ${body}`)
    }
    return res.json()
  }

  return {
    async domains(): Promise<Map<string, string>> {
      const parsed = domainsSchema.safeParse(await get('/domains.json', null))
      if (!parsed.success) throw new RevenueError('respons /domains.json Adsterra tidak dikenali')
      return new Map(parsed.data.items.map((d) => [d.id, d.title]))
    },

    async stats(input: { start: string; finish: string; groupBy: AdsterraGroup[] }): Promise<AdsterraStats> {
      if (input.groupBy.length < 1 || input.groupBy.length > 3) throw new RevenueError('group_by Adsterra harus 1-3 nilai')
      if (daysBetween(input.start, input.finish) > 365) throw new RevenueError('rentang Adsterra maksimum 366 hari')
      const query = new URLSearchParams({ start_date: input.start, finish_date: input.finish })
      for (const g of input.groupBy) query.append('group_by[]', g)
      const parsed = statsSchema.safeParse(await get('/stats.json', query))
      if (!parsed.success) throw new RevenueError(`respons /stats.json Adsterra tidak dikenali: ${parsed.error.issues[0]?.message ?? ''}`)
      return parsed.data
    },
  }
}

export interface AdsterraMapOptions {
  today: string
  lookbackDays: number
  currency: string
  /** id domain Adsterra -> nama domain (dari /domains.json). */
  domains: Map<string, string>
}

/**
 * Baris stats (group_by date + dimensi) -> entri ledger. Baris tanpa tanggal
 * ditolak: ledger selalu per hari. Tanggal lebih tua dari jendela lookback
 * = finalized; di dalam jendela = estimated (Adsterra masih bisa merevisi).
 */
export function adsterraToLedger(stats: AdsterraStats, options: AdsterraMapOptions): LedgerInput[] {
  return stats.items.map((row) => {
    if (!row.date) throw new RevenueError('baris stats Adsterra tanpa tanggal; group_by wajib memuat date')
    const domainTitle = row.domain ? (options.domains.get(row.domain) ?? null) : null
    const dimensions: Record<string, string> = {}
    if (row.domain) dimensions['domain_id'] = row.domain
    if (domainTitle) dimensions['domain'] = domainTitle
    if (row.placement) dimensions['placement'] = row.placement
    if (row.country) dimensions['country'] = row.country
    if (row.placement_sub_id) dimensions['sub_id'] = row.placement_sub_id
    const metrics: Record<string, number> = {}
    if (row.impression !== undefined) metrics['impressions'] = row.impression
    if (row.clicks !== undefined) metrics['clicks'] = row.clicks
    if (row.ctr !== undefined) metrics['ctr'] = row.ctr
    if (row.cpm !== undefined) metrics['cpm'] = row.cpm
    const keyParts = ['adsterra', row.date, row.domain ?? '-', row.placement ?? '-']
    if (row.country) keyParts.push(row.country)
    if (row.placement_sub_id) keyParts.push(`sub:${row.placement_sub_id}`)
    return {
      idempotencyKey: keyParts.join(':'),
      reportDate: row.date,
      grossAmount: toDecimal(row.revenue),
      currency: options.currency,
      status: statusByLookback(row.date, options.today, options.lookbackDays),
      metrics,
      dimensions,
      description: domainTitle ? `Adsterra ${domainTitle}` : 'Adsterra',
      propertyDomain: normalizeDomain(domainTitle),
    }
  })
}
