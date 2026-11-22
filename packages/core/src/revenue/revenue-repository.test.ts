// Ledger pendapatan terhadap database dev (dilewati tanpa DATABASE_URL),
// sebagai role aplikasi blog_app. Test memakai sumber dan situs uji sendiri
// (kode unik per proses) yang dihapus di afterAll; data contoh dan sumber
// bawaan tidak disentuh.
import { createDatabase, eq, inArray, revenueFxRates, revenueLedgerEntries, revenueLedgerRevisions, revenueProperties, revenueSources, sql } from '@framework/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { EditorError } from '../editor/errors'
import { createRepositories } from '../repositories'
import { LYNK_SIGNATURE_HEADER, lynkSignature, sampleLynkPayload } from './adapters/lynk'
import { importMappingSchema, mapImportRows } from './import/mapping'
import { parseImportFile } from './import/parse-file'
import { createRevenueService, MOCK_LYNK_MERCHANT_KEY } from './revenue-service'

const run = `r${process.pid}x${Date.now().toString(36)}`
const NOW = new Date('2026-11-22T05:00:00Z') // 12:00 WIB
const DOMAIN_A = `${run}-a.test`
const DOMAIN_B = `${run}-b.test`

describe.skipIf(!process.env['DATABASE_URL'])('ledger pendapatan (database dev, role blog_app)', () => {
  const db = createDatabase({ connectionString: process.env['DATABASE_URL'] ?? '', max: 4, applicationName: 'vitest-revenue' })
  const repos = createRepositories(db, { now: () => NOW, revenue: { baseCurrency: 'IDR', timeZone: 'Asia/Jakarta' } })
  const env: Record<string, string | undefined> = { REVENUE_MOCK: 'false' }
  const service = createRevenueService({ revenue: repos.revenue, queries: repos.revenueQueries }, {
    env,
    fetch: async () => { throw new Error('jaringan tidak boleh dipakai di test') },
    now: () => NOW,
    mockSites: [{ domain: DOMAIN_A, weight: 1 }, { domain: DOMAIN_B, weight: 0.5 }],
  })
  const codes = { manual: `${run}_manual`, adsterra: `${run}_adsterra`, adsense: `${run}_adsense`, lynk: `${run}_lynk` }
  const sourceIds: string[] = []
  let propertyA = ''
  const currency = 'XTS' // kode ISO untuk uji; kurs uji tidak memengaruhi USD

  beforeAll(async () => {
    const rows = await db.insert(revenueSources).values([
      { code: codes.manual, name: 'Uji manual', connector: 'generic', integrationType: 'manual', defaultCurrency: 'IDR' },
      { code: codes.adsterra, name: 'Uji Adsterra', connector: 'adsterra', integrationType: 'api', defaultCurrency: currency, credentialsEnv: 'UJI_ADSTERRA', lookbackDays: 3, config: { mock: true } },
      { code: codes.adsense, name: 'Uji AdSense', connector: 'adsense', integrationType: 'api', defaultCurrency: currency, credentialsEnv: 'UJI_ADSENSE', lookbackDays: 2, config: { mock: true, currencyCode: currency, finalizeDay: 7 } },
      { code: codes.lynk, name: 'Uji Lynk', connector: 'lynk', integrationType: 'webhook', defaultCurrency: 'IDR', credentialsEnv: 'UJI_LYNK', config: { timezone: 'Asia/Jakarta' } },
    ]).returning({ id: revenueSources.id })
    sourceIds.push(...rows.map((r) => r.id))
    const p = await repos.revenue.createProperty({ code: `${run}-a`, name: 'Situs uji A', domain: `https://www.${DOMAIN_A}/` })
    propertyA = p.id
    expect(p.domain).toBe(DOMAIN_A)
  })

  afterAll(async () => {
    await db.delete(revenueLedgerEntries).where(inArray(revenueLedgerEntries.sourceId, sourceIds))
    await db.delete(revenueSources).where(inArray(revenueSources.id, sourceIds))
    await db.delete(revenueProperties).where(sql`${revenueProperties.code} LIKE ${`${run}-%`}`)
    await db.delete(revenueFxRates).where(eq(revenueFxRates.currency, currency))
    await db.$client.end()
  })

  const source = (code: string) => repos.revenue.requireSource(code)

  it('upsert idempoten: kunci sama -> unchanged; angka berubah -> update + revisi oleh trigger', async () => {
    const s = await source(codes.manual)
    const entry = { idempotencyKey: `${run}:k1`, reportDate: '2026-11-20', grossAmount: '150000', currency: 'IDR', status: 'estimated' as const, metrics: { orders: 1 } }
    const first = await repos.revenue.upsertEntries(s, [entry], { channel: 'manual' })
    expect(first.counts).toMatchObject({ inserted: 1, failed: 0 })
    const again = await repos.revenue.upsertEntries(s, [{ ...entry, grossAmount: '150000.000' }], { channel: 'manual' })
    expect(again.counts).toMatchObject({ unchanged: 1, inserted: 0 })
    const revised = await repos.revenue.upsertEntries(s, [{ ...entry, grossAmount: '175000', status: 'finalized' }], { channel: 'manual' })
    expect(revised.counts).toMatchObject({ updated: 1 })
    const id = first.results[0]?.entryId as string
    const [row] = await db.select().from(revenueLedgerEntries).where(eq(revenueLedgerEntries.id, id))
    expect(row).toMatchObject({ grossAmount: '175000.000000', normalizedAmount: '175000.00', fxRateToBase: '1.00000000', status: 'finalized', revision: 2 })
    const revisions = await db.select().from(revenueLedgerRevisions).where(eq(revenueLedgerRevisions.entryId, id))
    expect(revisions).toHaveLength(1)
    expect(revisions[0]).toMatchObject({ revision: 1, grossAmount: '150000.000000', status: 'estimated' })
    // Final tidak turun ke estimated (aturan aplikasi) ...
    const downgrade = await repos.revenue.upsertEntries(s, [{ ...entry, grossAmount: '1' }], { channel: 'manual' })
    expect(downgrade.counts.skipped).toBe(1)
    // ... dan dijaga database untuk jalur mana pun.
    await expect(db.update(revenueLedgerEntries).set({ status: 'estimated' }).where(eq(revenueLedgerEntries.id, id))).rejects.toThrow()
    await expect(db.update(revenueLedgerEntries).set({ idempotencyKey: 'lain' }).where(eq(revenueLedgerEntries.id, id))).rejects.toThrow()
    await expect(db.update(revenueLedgerRevisions).set({ status: 'x' }).where(eq(revenueLedgerRevisions.entryId, id))).rejects.toThrow()
  })

  it('baris tidak valid gagal sendiri (savepoint), baris lain tetap tersimpan', async () => {
    const s = await source(codes.manual)
    const result = await repos.revenue.upsertEntries(s, [
      { idempotencyKey: `${run}:bad`, reportDate: '2026-02-30', grossAmount: '1', currency: 'IDR', status: 'finalized' },
      { idempotencyKey: `${run}:ok`, reportDate: '2026-11-21', grossAmount: '1', currency: 'IDR', status: 'finalized' },
      { idempotencyKey: `${run}:ref`, reportDate: '2026-11-21', grossAmount: '5', currency: 'IDR', status: 'refunded', note: 'x' },
    ], { channel: 'manual' })
    expect(result.counts).toMatchObject({ inserted: 1, failed: 2 })
  })

  it('kurs: tanpa kurs entri tersimpan tanpa konversi; recompute mengisinya memakai kurs terakhir <= tanggal', async () => {
    const s = await source(codes.manual)
    const result = await repos.revenue.upsertEntries(s, [
      { idempotencyKey: `${run}:fx1`, reportDate: '2026-11-10', grossAmount: '2.5', currency, status: 'finalized' },
      { idempotencyKey: `${run}:fx2`, reportDate: '2026-11-21', grossAmount: '1.154', currency, status: 'finalized' },
    ], { channel: 'manual' })
    expect(result.counts.inserted).toBe(2)
    const [before] = await db.select().from(revenueLedgerEntries).where(eq(revenueLedgerEntries.idempotencyKey, `${run}:fx1`))
    expect(before?.normalizedAmount).toBeNull()

    await repos.revenue.upsertFxRate({ currency, rateDate: '2026-11-01', rate: '16000' }, null)
    await repos.revenue.upsertFxRate({ currency, rateDate: '2026-11-15', rate: '16250.5' }, null)
    await expect(repos.revenue.upsertFxRate({ currency: 'IDR', rateDate: '2026-11-01', rate: '1' }, null)).rejects.toBeInstanceOf(EditorError)
    expect(await repos.revenue.recomputeFx({ mode: 'missing' })).toBeGreaterThanOrEqual(2)
    const rows = await db.select().from(revenueLedgerEntries).where(inArray(revenueLedgerEntries.idempotencyKey, [`${run}:fx1`, `${run}:fx2`])).orderBy(revenueLedgerEntries.reportDate)
    expect(rows.map((r) => [r.fxRateToBase, r.normalizedAmount, r.revision])).toEqual([
      ['16000.00000000', '40000.00', 1],
      ['16250.50000000', '18753.08', 1], // mengisi kurs kosong bukan revisi
    ])
    // Koreksi kurs untuk rentang: tercatat sebagai revisi.
    await repos.revenue.upsertFxRate({ currency, rateDate: '2026-11-15', rate: '16300' }, null)
    expect(await repos.revenue.recomputeFx({ mode: 'range', currency, from: '2026-11-15', to: '2026-11-30' })).toBe(1)
    const [fx2] = await db.select().from(revenueLedgerEntries).where(eq(revenueLedgerEntries.idempotencyKey, `${run}:fx2`))
    expect(fx2).toMatchObject({ normalizedAmount: '18810.20', revision: 2 })
  })

  it('input manual + adjustment wajib alasan; refund sebagian lalu sisa, tidak boleh melebihi', async () => {
    await expect(repos.revenue.createManualEntry({ sourceCode: codes.manual, reportDate: '2026-11-21', amount: '-5000', currency: 'IDR', kind: 'adjustment', description: 'Koreksi' }, null)).rejects.toThrow(/Alasan/)
    const adj = await repos.revenue.createManualEntry({ sourceCode: codes.manual, reportDate: '2026-11-21', amount: '-5000', currency: 'IDR', kind: 'adjustment', description: 'Koreksi selisih', note: 'Rekonsiliasi November' }, null)
    expect(adj.entryId).toBeTruthy()
    const deal = await repos.revenue.createManualEntry({ sourceCode: codes.manual, propertyId: propertyA, reportDate: '2026-11-21', amount: '2500000', currency: 'IDR', kind: 'income', description: 'Brand deal', externalId: `${run}-inv-1` }, null)
    await expect(repos.revenue.createManualEntry({ sourceCode: codes.manual, reportDate: '2026-11-21', amount: '1', currency: 'IDR', kind: 'income', description: 'x', externalId: `${run}-inv-1` }, null)).rejects.toThrow(/sudah pernah/)
    await repos.revenue.createRefund(deal.entryId, { amount: '500000', note: 'Pengembalian sebagian' }, null)
    await expect(repos.revenue.createRefund(deal.entryId, { amount: '2500000', note: 'lebih' }, null)).rejects.toThrow(/melebihi/)
    await repos.revenue.createRefund(deal.entryId, { note: 'Sisa' }, null)
    await expect(repos.revenue.createRefund(deal.entryId, { note: 'lagi' }, null)).rejects.toThrow(/refund penuh/)
    const detail = await repos.revenueQueries.getEntry(deal.entryId)
    expect(detail.corrections.map((c) => (c as { grossAmount: string }).grossAmount)).toEqual(['-500000.000000', '-2000000.000000'])
  })

  it('webhook Lynk: tanda tangan, duplikat tidak menggandakan saldo, event uji tidak menulis ledger', async () => {
    env['UJI_LYNK_MERCHANT_KEY'] = 'kunci-uji'
    const payload = sampleLynkPayload({ refId: `${run}-order-1`, messageId: `${run}-msg-1`, grandTotal: 97000, price: 100000, title: 'Kelas Menulis', createdAt: '2026-11-22T09:15:00' })
    const body = JSON.stringify(payload)
    const sig = lynkSignature(payload, 'kunci-uji')

    expect((await service.handleWebhook(codes.lynk, body, { [LYNK_SIGNATURE_HEADER]: 'a'.repeat(64) })).status).toBe(401)
    const ok = await service.handleWebhook(codes.lynk, body, { [LYNK_SIGNATURE_HEADER]: sig })
    expect(ok).toMatchObject({ status: 200, body: { status: 'processed' } })
    // Pengiriman ulang (message_id baru, order sama) -> duplicate.
    const retry = { ...payload, data: { ...payload.data, message_id: `${run}-msg-2` } }
    const dup = await service.handleWebhook(codes.lynk, JSON.stringify(retry), { [LYNK_SIGNATURE_HEADER]: lynkSignature(retry, 'kunci-uji') })
    expect(dup).toMatchObject({ status: 200, body: { status: 'duplicate', entryId: ok.body.entryId } })
    const s = await source(codes.lynk)
    const entries = await db.select().from(revenueLedgerEntries).where(eq(revenueLedgerEntries.sourceId, s.id))
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ grossAmount: '97000.000000', normalizedAmount: '97000.00', reportDate: '2026-11-22', channelType: 'webhook', externalId: `${run}-order-1` })
    expect(entries[0]?.occurredAt?.toISOString()).toBe('2026-11-22T02:15:00.000Z')

    const tested = await service.sendTestWebhook(codes.lynk)
    expect(tested).toMatchObject({ status: 200, body: { status: 'tested' } })
    expect(await db.select().from(revenueLedgerEntries).where(eq(revenueLedgerEntries.sourceId, s.id))).toHaveLength(1)

    delete env['UJI_LYNK_MERCHANT_KEY']
    expect((await service.handleWebhook(codes.lynk, body, { [LYNK_SIGNATURE_HEADER]: sig })).status).toBe(503)
    expect((await service.handleWebhook(codes.lynk, '{', {})).status).toBe(400)
    expect((await service.handleWebhook('tidak-ada', body, {})).status).toBe(404)

    const detail = await repos.revenueQueries.sourceDetail(codes.lynk, { from: '2026-11-01', to: '2026-11-22' })
    const statuses = (detail.webhooks as { status: string; test: boolean }[]).map((w) => `${w.status}${w.test ? ':test' : ''}`)
    // Terbaru dulu: 400 (rejected), 503 (failed), uji, duplikat, sah, tanda tangan salah.
    expect(statuses).toEqual(['rejected', 'failed', 'processed:test', 'duplicate', 'processed', 'rejected'])
    expect(MOCK_LYNK_MERCHANT_KEY).toBe('mock-merchant-key')
  })

  it('sync Adsterra (mock): baris per tanggal x domain x placement, sync ulang unchanged, revisi angka -> updated', async () => {
    const first = await service.sync(codes.adsterra, { trigger: 'manual' })
    expect(first).toMatchObject({ status: 'success', mock: true, range: { start: '2026-11-18', end: '2026-11-22' } })
    expect(first.counts).toMatchObject({ inserted: 5 * 2 * 2, failed: 0 })
    const again = await service.sync(codes.adsterra, { trigger: 'manual' })
    expect(again.counts).toMatchObject({ inserted: 0, unchanged: 20 })
    env['REVENUE_MOCK_REVISION'] = '1'
    const revised = await service.sync(codes.adsterra, { trigger: 'manual' })
    delete env['REVENUE_MOCK_REVISION']
    // Angka direvisi sumber: semua baris diperbarui, versi lama ke revisi.
    expect(revised.counts).toMatchObject({ updated: 20, skipped: 0 })
    const s = await source(codes.adsterra)
    const rows = await db.select().from(revenueLedgerEntries).where(eq(revenueLedgerEntries.sourceId, s.id))
    // Tanpa kurs XTS untuk tanggal itu? Kurs 16000 berlaku sejak 1 Nov -> terkonversi.
    expect(rows.every((r) => r.normalizedAmount !== null)).toBe(true)
    expect(rows.filter((r) => r.propertyId === propertyA)).toHaveLength(10)
    expect(rows.filter((r) => r.propertyId === null)).toHaveLength(10)
    // Situs B dibuat belakangan: entri lamanya otomatis terhubung.
    const b = await repos.revenue.createProperty({ code: `${run}-b`, name: 'Situs uji B', domain: DOMAIN_B })
    expect(b.linkedEntries).toBe(10)
  })

  it('sync paralel untuk sumber yang sama ditolak (satu run berjalan per sumber)', async () => {
    const results = await Promise.allSettled([service.sync(codes.adsense, { trigger: 'manual' }), service.sync(codes.adsense, { trigger: 'manual' })])
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(rejected).toHaveLength(1)
    expect(String((rejected[0] as PromiseRejectedResult).reason.message)).toMatch(/sedang berjalan/)
  })

  it('sync AdSense (mock): header-driven, mata uang dari laporan, kredensial tanpa mock wajib ada', async () => {
    const summary = await service.sync(codes.adsense, { trigger: 'manual', from: '2026-10-30', to: '2026-11-22' })
    expect(summary.status).toBe('success')
    const s = await source(codes.adsense)
    const rows = await db.select().from(revenueLedgerEntries).where(eq(revenueLedgerEntries.sourceId, s.id))
    expect(new Set(rows.map((r) => r.currency))).toEqual(new Set([currency]))
    expect(rows.find((r) => r.reportDate === '2026-10-31')?.status).toBe('finalized')
    expect(rows.find((r) => r.reportDate === '2026-11-21')?.status).toBe('estimated')
    // Matikan mock tanpa kredensial -> run gagal dengan pesan, tidak melempar.
    await db.update(revenueSources).set({ config: { finalizeDay: 7 } }).where(eq(revenueSources.id, s.id))
    const failed = await service.sync(codes.adsense, { trigger: 'manual' })
    expect(failed.status).toBe('failed')
    expect(failed.error).toMatch(/UJI_ADSENSE_CLIENT_ID/)
  })

  it('impor CSV: commit menulis ledger, impor ulang file sama = unchanged, batch tidak bisa di-commit dua kali', async () => {
    const s = await source(codes.manual)
    const csv = 'Payment ID,Date,Product,Amount,Currency,Status,Site\n'
      + `${run}-p1,2026-11-19,Membership Pro,29.00,${currency},paid,${DOMAIN_A}\n`
      + `${run}-p2,2026-11-20,Membership Pro,29.00,${currency},refunded,${DOMAIN_A}\n`
      + `${run}-p3,bukan-tanggal,Membership Pro,29.00,${currency},paid,\n`
    const commit = async () => {
      const table = parseImportFile('whop.csv', new TextEncoder().encode(csv))
      const batchId = await repos.revenue.createImportBatch({ sourceId: s.id, fileName: 'whop.csv', format: table.format, sha256: 'x', headers: table.headers, rows: table.rows, userId: null })
      const mapping = importMappingSchema.parse({ date: 'Date', amount: 'Amount', currency: 'Currency', externalId: 'Payment ID', status: 'Status', description: 'Product', property: 'Site' })
      const result = await repos.revenue.commitImportBatch(batchId, (b) => ({ ...mapImportRows(b.rows, mapping, { sourceCode: codes.manual, defaultCurrency: 'IDR' }), mapping }), null)
      return { batchId, result }
    }
    const first = await commit()
    expect(first.result.counts).toMatchObject({ inserted: 2, failed: 1 })
    expect(first.result.errors[0]?.row).toBe(3)
    const second = await commit()
    expect(second.result.counts).toMatchObject({ inserted: 0, unchanged: 2, failed: 1 })
    await expect(repos.revenue.commitImportBatch(first.batchId, () => ({ entries: [], errors: [], duplicates: [], mapping: {} }), null)).rejects.toThrow(/sudah di-commit/)
    const batch = await repos.revenue.getImportBatch(first.batchId)
    expect(batch).toMatchObject({ status: 'committed', rows: null, inserted: 2, failed: 1 })
  })

  it('overview dashboard: total, periode sebelumnya, per sumber, per situs, seri', async () => {
    const sources = [codes.manual, codes.adsterra, codes.adsense, codes.lynk]
    const o = await repos.revenueQueries.overview({ from: '2026-11-16', to: '2026-11-22', sources }, 'day')
    expect(o.range).toMatchObject({ previousFrom: '2026-11-09', previousTo: '2026-11-15', today: '2026-11-22' })
    expect(o.bySource.map((x) => x.code).sort()).toEqual([...sources].sort())
    const sumSources = o.bySource.reduce((n, x) => n + Number(x.amount), 0)
    expect(sumSources).toBeCloseTo(Number(o.total), 2)
    const sumSeries = o.series.reduce((n, x) => n + Number(x.amount), 0)
    expect(sumSeries).toBeCloseTo(Number(o.total), 2)
    expect(o.byProperty.some((p) => p.propertyId === propertyA)).toBe(true)
    const weekly = await repos.revenueQueries.overview({ from: '2026-11-01', to: '2026-11-22', sources }, 'month')
    expect(new Set(weekly.series.map((x) => x.bucket))).toEqual(new Set(['2026-11-01']))
    const onlyFinal = await repos.revenueQueries.overview({ from: '2026-11-16', to: '2026-11-22', sources, statuses: ['finalized'] }, 'day')
    expect(onlyFinal.byStatus.map((x) => x.status)).toEqual(['finalized'])
    const health = await repos.revenueQueries.health()
    expect(health.find((h) => h.code === codes.adsense)?.lastRun?.status).toBe('failed')
    const detail = await repos.revenueQueries.sourceDetail(codes.adsterra, { from: '2026-11-16', to: '2026-11-22' })
    expect(Number(detail.metrics['impressions'])).toBeGreaterThan(0)
    expect(detail.breakdowns.map((b) => b.key).sort()).toEqual(['domain', 'placement'])
  })
})
