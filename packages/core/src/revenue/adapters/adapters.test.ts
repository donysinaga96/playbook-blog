import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { adsenseStatus, adsenseToLedger, createAdsenseClient, parseAdsenseReport, ADSENSE_METRICS } from './adsense'
import { adsterraToLedger, createAdsterraClient } from './adsterra'
import { lynkSignature, lynkToLedger, parseLynkBody, sampleLynkPayload, verifyLynkSignature } from './lynk'
import { createMockRevenueFetch } from './mock-fetch'
import { getHeadlessScraper, headlessGloballyEnabled, runHeadless } from './headless'
import { RevenueError } from '../types'

// Contoh payload persis dari dokumentasi Lynk.id (Postman "Lynk Webhook").
const LYNK_DOC_PAYLOAD = {
  event: 'payment.received',
  data: {
    message_action: 'SUCCESS',
    message_code: '0',
    message_data: {
      createdAt: '2025-04-10T14:30:45',
      customer: { email: 'user@lynk.id', name: 'Lynk User', phone: '0812345677889' },
      items: [{ addons: [{ id: 'x', name: 'Iniprodukaddon', price: '50,000' }], appointment_data: {}, pafId: '', price: 25000, public_affiliate_content: {}, qty: 1, stock: 1, title: 'Digital Produk', uuid: '63cfd869524d15196a557388-8244-36439' }],
      refId: '13f8d23beeb2aacbbc01c94060cc88d7',
      shippingAddress: '',
      shippingInfo: '',
      totals: { affiliate: 0, convenienceFee: -3000, discount: 0, grandTotal: 72000, totalAddon: 50000, totalItem: 1, totalPrice: 25000, totalShipping: 0 },
    },
    message_desc: '',
    message_id: 'API_CALL_1744270275143115_4624014',
    message_title: '',
  },
}

describe('Lynk.id webhook', () => {
  const parsed = parseLynkBody(JSON.stringify(LYNK_DOC_PAYLOAD))
  if (parsed.kind !== 'ok') throw new Error('payload dokumentasi harus lolos')
  const payload = parsed.payload

  it('tanda tangan = sha256(grandTotal + refId + message_id + merchantKey), sesuai contoh kode dokumentasi', () => {
    const expected = createHash('sha256').update('72000' + '13f8d23beeb2aacbbc01c94060cc88d7' + 'API_CALL_1744270275143115_4624014' + 'rahasia').digest('hex')
    expect(lynkSignature(payload, 'rahasia')).toBe(expected)
    expect(verifyLynkSignature(payload, expected, 'rahasia')).toBe(true)
    expect(verifyLynkSignature(payload, expected.toUpperCase(), 'rahasia')).toBe(true)
    expect(verifyLynkSignature(payload, expected, 'kunci-lain')).toBe(false)
    expect(verifyLynkSignature(payload, 'bukan-hex', 'rahasia')).toBe(false)
    expect(verifyLynkSignature(payload, null, 'rahasia')).toBe(false)
  })

  it('payload yang diubah (nominal) tidak lolos tanda tangan lama', () => {
    const signature = lynkSignature(payload, 'rahasia')
    const tampered = structuredClone(payload)
    tampered.data.message_data.totals.grandTotal = 720000
    expect(verifyLynkSignature(tampered, signature, 'rahasia')).toBe(false)
  })

  it('mapping: grandTotal bersih IDR, waktu WIB -> UTC, kunci per order', () => {
    const result = lynkToLedger(payload, { timeZone: 'Asia/Jakarta', now: new Date() })
    expect(result.kind).toBe('entry')
    if (result.kind !== 'entry') return
    expect(result.entry).toMatchObject({
      idempotencyKey: 'lynk:13f8d23beeb2aacbbc01c94060cc88d7:sale',
      externalId: '13f8d23beeb2aacbbc01c94060cc88d7',
      reportDate: '2025-04-10',
      grossAmount: '72000',
      currency: 'IDR',
      status: 'finalized',
      dimensions: { product: 'Digital Produk' },
    })
    expect(result.entry.occurredAt?.toISOString()).toBe('2025-04-10T07:30:45.000Z')
    expect(result.entry.metrics).toMatchObject({ orders: 1, items: 1, convenienceFee: -3000, totalAddon: 50000 })
  })

  it('event lain atau message_action bukan SUCCESS diabaikan', () => {
    expect(lynkToLedger({ ...payload, event: 'profile.updated' }, { timeZone: 'Asia/Jakarta', now: new Date() }).kind).toBe('ignored')
    expect(lynkToLedger({ ...payload, data: { ...payload.data, message_action: 'FAILED' } }, { timeZone: 'Asia/Jakarta', now: new Date() }).kind).toBe('ignored')
  })

  it('body rusak ditolak dengan pesan', () => {
    expect(parseLynkBody('{').kind).toBe('invalid')
    expect(parseLynkBody(JSON.stringify({ event: 'payment.received', data: {} })).kind).toBe('invalid')
  })

  it('sampleLynkPayload berbentuk sama dan lolos parse', () => {
    const sample = sampleLynkPayload({ refId: 'r1', messageId: 'm1', grandTotal: 97000, price: 100000, title: 'E-book', createdAt: '2026-11-20T10:00:00' })
    expect(parseLynkBody(JSON.stringify(sample)).kind).toBe('ok')
  })
})

describe('Adsterra Publisher API', () => {
  const domains = new Map([['281040', 'beritakonoha.id'], ['291463', 'www.cekbansos.info']])

  it('upsert per dimensi: kunci memuat tanggal + domain + placement (+ country/sub_id)', () => {
    const entries = adsterraToLedger({
      items: [
        { date: '2026-11-20', domain: '281040', placement: '1578458751', impression: 8114, clicks: 433, ctr: 5.336, cpm: 0.354, revenue: 2.869 },
        { date: '2026-11-20', domain: '291463', placement: '34848952', country: 'ID', impression: 100, clicks: 1, ctr: 1, cpm: 1.5, revenue: '0.15' },
        { date: '2026-11-10', domain: '999', placement_sub_id: 'abc', impression: 1, clicks: 0, revenue: 0 },
      ],
    }, { today: '2026-11-22', lookbackDays: 3, currency: 'USD', domains })
    expect(entries.map((e) => e.idempotencyKey)).toEqual([
      'adsterra:2026-11-20:281040:1578458751',
      'adsterra:2026-11-20:291463:34848952:ID',
      'adsterra:2026-11-10:999:-:sub:abc',
    ])
    expect(entries[0]).toMatchObject({ grossAmount: '2.869', currency: 'USD', status: 'estimated', propertyDomain: 'beritakonoha.id', metrics: { impressions: 8114, clicks: 433, ctr: 5.336, cpm: 0.354 } })
    expect(entries[1]?.propertyDomain).toBe('cekbansos.info')
    expect(entries[2]).toMatchObject({ status: 'finalized', propertyDomain: null, dimensions: { domain_id: '999', sub_id: 'abc' } })
  })

  it('baris tanpa tanggal ditolak (ledger selalu harian)', () => {
    expect(() => adsterraToLedger({ items: [{ domain: '1', revenue: 1 }] }, { today: '2026-11-22', lookbackDays: 3, currency: 'USD', domains })).toThrow(RevenueError)
  })

  it('client memakai header X-API-Key dan group_by[]; 401 jadi pesan jelas', async () => {
    const calls: string[] = []
    const fetchSpy = createMockRevenueFetch()
    const client = createAdsterraClient({ token: 't', fetch: async (url, init) => { calls.push(url); return fetchSpy(url, init) } })
    const stats = await client.stats({ start: '2026-11-20', finish: '2026-11-21', groupBy: ['date', 'domain', 'placement'] })
    expect(calls[0]).toContain('/stats.json?start_date=2026-11-20&finish_date=2026-11-21&group_by%5B%5D=date&group_by%5B%5D=domain&group_by%5B%5D=placement')
    expect(stats.items.length).toBe(2 * 4 * 2)
    const noToken = createAdsterraClient({ token: '', fetch: createMockRevenueFetch() })
    await expect(noToken.domains()).rejects.toThrow(/HTTP 401.*token/)
  })

  it('mock deterministik: data yang sama untuk permintaan yang sama, berubah bila revisi dinaikkan', async () => {
    const a = await createAdsterraClient({ token: 't', fetch: createMockRevenueFetch() }).stats({ start: '2026-11-01', finish: '2026-11-01', groupBy: ['date', 'domain'] })
    const b = await createAdsterraClient({ token: 't', fetch: createMockRevenueFetch() }).stats({ start: '2026-11-01', finish: '2026-11-01', groupBy: ['date', 'domain'] })
    const c = await createAdsterraClient({ token: 't', fetch: createMockRevenueFetch({ revision: 1 }) }).stats({ start: '2026-11-01', finish: '2026-11-01', groupBy: ['date', 'domain'] })
    expect(a.items).toEqual(b.items)
    expect(a.items).not.toEqual(c.items)
  })
})

describe('Google AdSense Management API v2', () => {
  const report = {
    totalMatchedRows: '2',
    headers: [
      { name: 'DOMAIN_NAME', type: 'DIMENSION' },
      { name: 'DATE', type: 'DIMENSION' },
      { name: 'CLICKS', type: 'METRIC_TALLY' },
      { name: 'ESTIMATED_EARNINGS', type: 'METRIC_CURRENCY', currencyCode: 'USD' },
      { name: 'PAGE_VIEWS', type: 'METRIC_TALLY' },
      { name: 'PAGE_VIEWS_RPM', type: 'METRIC_CURRENCY', currencyCode: 'USD' },
    ],
    rows: [
      { cells: [{ value: 'beritakonoha.id' }, { value: '2026-11-21' }, { value: '41' }, { value: '3.17' }, { value: '5120' }, { value: '0.62' }] },
      { cells: [{ value: 'kabartekno.id' }, { value: '2026-10-31' }, { value: '12' }, { value: '0.80' }, { value: '2000' }, { value: '0.40' }] },
    ],
  }

  it('parsing digerakkan header: urutan kolom tidak diasumsikan, mata uang dari header METRIC_CURRENCY', () => {
    const parsed = parseAdsenseReport(report)
    expect(parsed.currencyCode).toBe('USD')
    expect(parsed.rows[0]).toEqual({ DOMAIN_NAME: 'beritakonoha.id', DATE: '2026-11-21', CLICKS: '41', ESTIMATED_EARNINGS: '3.17', PAGE_VIEWS: '5120', PAGE_VIEWS_RPM: '0.62' })
    const entries = adsenseToLedger(parsed, { today: '2026-11-22', finalizeDay: 7, fallbackCurrency: 'IDR' })
    expect(entries[0]).toMatchObject({ idempotencyKey: 'adsense:2026-11-21:beritakonoha.id', grossAmount: '3.17', currency: 'USD', status: 'estimated', metrics: { clicks: 41, pageViews: 5120, pageViewsRpm: 0.62 }, propertyDomain: 'beritakonoha.id' })
    expect(entries[1]?.status).toBe('finalized') // Oktober, dan hari ini >= tanggal 7 November
  })

  it('laporan terpotong (totalMatchedRows > baris) gagal, tidak disimpan diam-diam', () => {
    expect(() => parseAdsenseReport({ ...report, totalMatchedRows: '5000' })).toThrow(/terpotong: 2 dari 5000/)
  })

  it('jumlah sel tidak sama dengan header -> gagal', () => {
    expect(() => parseAdsenseReport({ ...report, rows: [{ cells: [{ value: 'x' }] }] })).toThrow(RevenueError)
  })

  it('lebih dari satu mata uang -> gagal', () => {
    expect(() => parseAdsenseReport({ ...report, headers: [...report.headers.slice(0, 5), { name: 'PAGE_VIEWS_RPM', type: 'METRIC_CURRENCY', currencyCode: 'EUR' }] })).toThrow(/lebih dari satu mata uang/)
  })

  it('status: bulan berjalan estimated; bulan lalu final mulai finalizeDay; lebih lama final', () => {
    expect(adsenseStatus('2026-11-21', '2026-11-22', 7)).toBe('estimated')
    expect(adsenseStatus('2026-10-31', '2026-11-03', 7)).toBe('estimated')
    expect(adsenseStatus('2026-10-31', '2026-11-07', 7)).toBe('finalized')
    expect(adsenseStatus('2026-09-30', '2026-11-01', 7)).toBe('finalized')
    expect(adsenseStatus('2025-12-31', '2026-01-02', 7)).toBe('estimated')
  })

  it('client: refresh token -> access token, lalu reports:generate dengan parameter CUSTOM', async () => {
    const calls: string[] = []
    const mock = createMockRevenueFetch()
    const client = createAdsenseClient({ clientId: 'c', clientSecret: 's', refreshToken: 'r', fetch: async (url, init) => { calls.push(url); return mock(url, init) } })
    const json = await client.generateReport({ account: 'accounts/pub-123', start: '2026-11-01', end: '2026-11-02', dimensions: ['DATE', 'DOMAIN_NAME'], metrics: ADSENSE_METRICS })
    expect(calls[0]).toBe('https://oauth2.googleapis.com/token')
    expect(calls[1]).toContain('/v2/accounts/pub-123/reports:generate?dateRange=CUSTOM&startDate.year=2026&startDate.month=11&startDate.day=1')
    const parsed = parseAdsenseReport(json)
    expect(parsed.rows.length).toBe(2 * 4)
    expect(parsed.currencyCode).toBe('USD')
    await expect(client.generateReport({ account: 'pub-123', start: '2026-11-01', end: '2026-11-01', dimensions: ['DATE'], metrics: ADSENSE_METRICS })).rejects.toThrow(/accounts\/pub-/)
  })
})

describe('headless runner', () => {
  it('nonaktif secara bawaan', () => {
    expect(headlessGloballyEnabled({})).toBe(false)
    expect(headlessGloballyEnabled({ REVENUE_HEADLESS_ENABLED: 'true' })).toBe(true)
  })
  it('batas waktu menghentikan scraper yang macet', async () => {
    const slow = { key: 'lambat', description: '', run: () => new Promise<never>(() => {}) }
    await expect(runHeadless(slow, { range: { start: '2026-11-01', end: '2026-11-01' }, config: {}, env: () => undefined, log: () => {} }, 20)).rejects.toThrow(/batas waktu/)
  })
  it('scraper mock menghasilkan entri per hari', async () => {
    const scraper = getHeadlessScraper('mock')
    expect(scraper).toBeDefined()
    const rows = await runHeadless(scraper!, { range: { start: '2026-11-01', end: '2026-11-03' }, config: {}, env: () => undefined, log: () => {} })
    expect(rows.map((r) => r.reportDate)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03'])
  })
})
