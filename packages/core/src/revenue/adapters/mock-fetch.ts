// Mode mock/sandbox (REVENUE_MOCK=true atau config.mock=true per sumber):
// fetch palsu yang menjawab dengan BENTUK RESPONS ASLI Adsterra dan Google
// AdSense. Adapter, parsing header, normalisasi kurs, dan UI berjalan lewat
// kode yang sama dengan produksi; hanya jaringan yang diganti.
//
// Angka deterministik: hash dari (tanggal, dimensi) + pola mingguan + tren
// naik pelan, sehingga sync ulang menghasilkan angka yang sama (unchanged),
// kecuali `revision` dinaikkan untuk mensimulasikan revisi angka.
import { ADSENSE_TOKEN_URL } from './adsense'
import type { FetchLike } from './adsterra'
import { addDays, eachDate } from '../dates'

export interface MockSite {
  /** Nama domain seperti di laporan jaringan iklan. */
  domain: string
  /** Skala trafik relatif (1 = sedang). */
  weight: number
}

export const DEFAULT_MOCK_SITES: MockSite[] = [
  { domain: 'beritakonoha.id', weight: 1.4 },
  { domain: 'kabartekno.id', weight: 1 },
  { domain: 'resepnusantara.com', weight: 0.7 },
  { domain: 'cekbansos.info', weight: 0.45 },
]

export interface MockOptions {
  sites?: MockSite[]
  /** Naikkan untuk mensimulasikan revisi angka oleh jaringan iklan. */
  revision?: number
}

/** Hash FNV-1a -> [0, 1). */
export function unitHash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) / 0x1_0000_0000
}

/** Faktor trafik harian: akhir pekan lebih rendah, tren naik ~0,15%/hari. */
function dayFactor(date: string): number {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay()
  const weekly = dow === 0 || dow === 6 ? 0.78 : 1
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse('2026-01-01T00:00:00Z')) / 86_400_000
  return weekly * (1 + days * 0.0015)
}

const round = (n: number, digits: number) => Number(n.toFixed(digits))

function json(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

const PLACEMENTS = [
  { suffix: 1, kind: 'banner', cpmBase: 0.42, share: 0.62 },
  { suffix: 2, kind: 'popunder', cpmBase: 1.35, share: 0.38 },
]

function adsterraDomainId(domain: string): number {
  return 11_000_000 + Math.floor(unitHash(`adsterra-domain:${domain}`) * 900_000)
}

export function createMockRevenueFetch(options: MockOptions = {}): FetchLike {
  const sites = options.sites ?? DEFAULT_MOCK_SITES
  const revision = options.revision ?? 0

  return async (input, init) => {
    const url = new URL(input)
    const headers = Object.fromEntries(Object.entries(init?.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]))

    // ---------- Adsterra ----------
    if (url.hostname === 'api3.adsterratools.com') {
      if (!headers['x-api-key']) return json(401, { message: 'Invalid token provided' })
      if (url.pathname.endsWith('/domains.json')) {
        const items = sites.map((s) => ({ id: adsterraDomainId(s.domain), title: s.domain }))
        return json(200, { items, itemCount: items.length })
      }
      if (url.pathname.endsWith('/stats.json')) {
        const start = url.searchParams.get('start_date') ?? ''
        const finish = url.searchParams.get('finish_date') ?? ''
        const groups = url.searchParams.getAll('group_by[]')
        if (!start || !finish || start > finish) return json(422, { message: 'invalid date range' })
        const items: Record<string, unknown>[] = []
        for (const date of eachDate(start, finish)) {
          for (const site of sites) {
            for (const p of PLACEMENTS) {
              const noise = unitHash(`adsterra:${date}:${site.domain}:${p.suffix}:${revision}`)
              const impression = Math.round(site.weight * dayFactor(date) * p.share * (5200 + noise * 2600))
              const cpm = round(p.cpmBase * (0.85 + noise * 0.3), 3)
              const revenue = round((impression / 1000) * cpm, 3)
              const clicks = Math.round(impression * (p.kind === 'banner' ? 0.006 : 0.0012) * (0.7 + noise * 0.6))
              items.push({
                date,
                domain: adsterraDomainId(site.domain),
                placement: adsterraDomainId(site.domain) * 10 + p.suffix,
                impression,
                clicks,
                ctr: impression ? round((clicks / impression) * 100, 3) : 0,
                cpm,
                revenue,
              })
            }
          }
        }
        // group_by tanpa placement: jumlahkan per tanggal + domain (seperti API).
        const rows = groups.includes('placement') ? items : collapse(items, groups)
        return json(200, { items: rows, itemCount: rows.length, dbLastUpdateTime: `${finish} 23:00:00`, dbDateTime: `${finish} 23:00:05` })
      }
      return json(404, { message: 'not found' })
    }

    // ---------- Google OAuth + AdSense ----------
    if (input === ADSENSE_TOKEN_URL) {
      const body = new URLSearchParams(init?.body ?? '')
      if (!body.get('refresh_token')) return json(400, { error: 'invalid_request', error_description: 'refresh_token kosong' })
      return json(200, { access_token: 'mock-access-token', expires_in: 3599, scope: 'https://www.googleapis.com/auth/adsense.readonly', token_type: 'Bearer' })
    }
    if (url.hostname === 'adsense.googleapis.com' && url.pathname.endsWith('/reports:generate')) {
      if (headers['authorization'] !== 'Bearer mock-access-token') return json(401, { error: { code: 401, message: 'Request had invalid authentication credentials.' } })
      const p = (prefix: string) => `${url.searchParams.get(`${prefix}.year`)}-${String(url.searchParams.get(`${prefix}.month`)).padStart(2, '0')}-${String(url.searchParams.get(`${prefix}.day`)).padStart(2, '0')}`
      const start = p('startDate')
      const end = p('endDate')
      const dims = url.searchParams.getAll('dimensions')
      const metrics = url.searchParams.getAll('metrics')
      const currency = url.searchParams.get('currencyCode') ?? 'USD'
      const headersOut = [
        ...dims.map((name) => ({ name, type: 'DIMENSION' })),
        ...metrics.map((name) => metricHeader(name, currency)),
      ]
      const rows: { cells: { value: string }[] }[] = []
      for (const date of eachDate(start, end)) {
        for (const site of dims.includes('DOMAIN_NAME') ? sites : [{ domain: '', weight: sites.reduce((n, s) => n + s.weight, 0) }]) {
          const noise = unitHash(`adsense:${date}:${site.domain}:${revision}`)
          const pageViews = Math.round(site.weight * dayFactor(date) * (3800 + noise * 1500))
          const impressions = Math.round(pageViews * 2.6)
          const clicks = Math.round(impressions * 0.009 * (0.75 + noise * 0.5))
          const cpc = round(0.035 + noise * 0.03, 2)
          const earnings = round(clicks * cpc + impressions * 0.00011, 2)
          const values: Record<string, string> = {
            DATE: date,
            DOMAIN_NAME: site.domain,
            ESTIMATED_EARNINGS: earnings.toFixed(2),
            PAGE_VIEWS: String(pageViews),
            CLICKS: String(clicks),
            IMPRESSIONS: String(impressions),
            PAGE_VIEWS_RPM: pageViews ? ((earnings / pageViews) * 1000).toFixed(2) : '0',
            IMPRESSIONS_RPM: impressions ? ((earnings / impressions) * 1000).toFixed(2) : '0',
            COST_PER_CLICK: clicks ? (earnings / clicks).toFixed(2) : '0',
          }
          rows.push({ cells: headersOut.map((h) => ({ value: values[h.name] ?? '' })) })
        }
      }
      return json(200, {
        totalMatchedRows: String(rows.length),
        headers: headersOut,
        rows,
        totals: { cells: [] },
        averages: { cells: [] },
        startDate: dateObj(start),
        endDate: dateObj(addDays(end, 0)),
      })
    }

    return json(404, { message: `mock tidak mengenal ${url.hostname}${url.pathname}` })
  }
}

function metricHeader(name: string, currency: string) {
  if (name === 'ESTIMATED_EARNINGS' || name.endsWith('_RPM') || name === 'COST_PER_CLICK') return { name, type: 'METRIC_CURRENCY', currencyCode: currency }
  if (name.endsWith('_CTR')) return { name, type: 'METRIC_RATIO' }
  return { name, type: 'METRIC_TALLY' }
}

function dateObj(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return { year, month, day }
}

function collapse(items: Record<string, unknown>[], groups: string[]): Record<string, unknown>[] {
  const map = new Map<string, Record<string, unknown>>()
  for (const item of items) {
    const key = groups.map((g) => String(item[g])).join('|')
    const acc = map.get(key)
    if (!acc) {
      map.set(key, { ...Object.fromEntries(groups.map((g) => [g, item[g]])), impression: item['impression'], clicks: item['clicks'], revenue: item['revenue'] })
      continue
    }
    acc['impression'] = Number(acc['impression']) + Number(item['impression'])
    acc['clicks'] = Number(acc['clicks']) + Number(item['clicks'])
    acc['revenue'] = round(Number(acc['revenue']) + Number(item['revenue']), 3)
  }
  return [...map.values()].map((r) => ({
    ...r,
    ctr: Number(r['impression']) ? round((Number(r['clicks']) / Number(r['impression'])) * 100, 3) : 0,
    cpm: Number(r['impression']) ? round((Number(r['revenue']) / Number(r['impression'])) * 1000, 3) : 0,
  }))
}
