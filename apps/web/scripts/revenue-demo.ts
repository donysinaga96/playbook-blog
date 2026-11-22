// Data CONTOH dashboard pendapatan (ADR-011) untuk database DEV: Adsterra,
// Google AdSense, Lynk.id, dan Whop, beberapa bulan ke belakang sampai hari
// ini. Semua angka fiktif dan dimasukkan LEWAT JALUR INGEST SUNGGUHAN:
//
//   Adsterra, AdSense  sync dengan fetch mock (bentuk respons API asli)
//   Lynk.id            webhook payment.received bertanda tangan (+1 kirim ulang, +1 refund manual)
//   Whop               impor file CSV (wizard yang sama dengan admin)
//   Lainnya            input manual brand deal + adjustment
//   Kurs USD->IDR      kurs contoh per bulan (bukan kurs resmi)
//   Situs              Berita Konoha, Kabar Tekno, Resep Nusantara, Cek Bansos
//
//   pnpm revenue:demo                 pasang (ulang) untuk 120 hari terakhir
//   pnpm revenue:demo --days 60       rentang lain (maks. 360)
//   pnpm revenue:demo --remove        hapus semua data contoh
//
// Penanda data contoh: run sync mock dari skrip ini, refId Lynk "DEMO-",
// ID pembayaran Whop "demo_pay_", ID eksternal manual "DEMO-", kurs dengan
// catatan "Contoh". --remove hanya menghapus yang bertanda itu.
import { parseArgs } from 'node:util'
import { addDays, createRepositories, createRevenueService, dateInZone, LYNK_SIGNATURE_HEADER, lynkSignature, MOCK_LYNK_MERCHANT_KEY, importMappingSchema, mapImportRows, parseImportFile, revenueSettingsFromEnv, sampleLynkPayload, unitHash } from '@framework/core'
import { createDatabase, databaseUrlFromEnv, eq, inArray, revenueFxRates, revenueImportBatches, revenueLedgerEntries, revenueProperties, revenueSources, revenueSyncRuns, revenueWebhookEvents, sites, sql } from '@framework/db'

const { values } = parseArgs({ options: { remove: { type: 'boolean', default: false }, days: { type: 'string', default: '120' } } })
const days = Math.min(Math.max(Number(values.days) || 120, 7), 360)

const db = createDatabase({ connectionString: databaseUrlFromEnv(), max: 4, applicationName: 'revenue-demo' })
const settings = revenueSettingsFromEnv(process.env)
const repos = createRepositories(db, { revenue: settings })
// Selalu mock untuk skrip ini: tidak ada request ke jaringan.
const env: Record<string, string | undefined> = { ...process.env, REVENUE_MOCK: 'true' }
const service = createRevenueService({ revenue: repos.revenue, queries: repos.revenueQueries }, { env, fetch: () => Promise.reject(new Error('jaringan tidak dipakai')), now: () => new Date() })

const PROPERTIES = [
  { code: 'beritakonoha', name: 'Berita Konoha', domain: 'beritakonoha.id', siteCode: 'beritakonoha' },
  { code: 'kabartekno', name: 'Kabar Tekno', domain: 'kabartekno.id', siteCode: 'kabar-tekno' },
  { code: 'resepnusantara', name: 'Resep Nusantara', domain: 'resepnusantara.com', siteCode: null },
  { code: 'cekbansos', name: 'Cek Bansos', domain: 'cekbansos.info', siteCode: null },
]

async function remove() {
  const demoRuns = db.select({ id: revenueSyncRuns.id }).from(revenueSyncRuns).where(sql`${revenueSyncRuns.log}::text LIKE '%[data contoh]%'`)
  const deleted = await db.delete(revenueLedgerEntries).where(sql`
       ${revenueLedgerEntries.syncRunId} IN (${demoRuns})
    OR ${revenueLedgerEntries.externalId} LIKE 'DEMO-%'
    OR ${revenueLedgerEntries.externalId} LIKE 'demo_pay_%'
    OR ${revenueLedgerEntries.adjustsEntryId} IS NOT NULL AND ${revenueLedgerEntries.note} LIKE '%(contoh)%'
    OR ${revenueLedgerEntries.idempotencyKey} LIKE 'adjustment:%' AND ${revenueLedgerEntries.note} LIKE '%(contoh)%'`).returning({ id: revenueLedgerEntries.id })
  // Refund contoh merujuk entri contoh; hapus yang tersisa (adjusts_entry_id sudah NULL setelah induknya terhapus).
  await db.delete(revenueLedgerEntries).where(sql`${revenueLedgerEntries.status} = 'refunded' AND ${revenueLedgerEntries.note} LIKE '%(contoh)%'`)
  await db.delete(revenueSyncRuns).where(sql`${revenueSyncRuns.log}::text LIKE '%[data contoh]%'`)
  await db.delete(revenueWebhookEvents).where(sql`${revenueWebhookEvents.externalEventId} LIKE 'DEMO_%'`)
  await db.delete(revenueImportBatches).where(sql`${revenueImportBatches.fileName} LIKE 'contoh-%'`)
  await db.delete(revenueFxRates).where(sql`${revenueFxRates.note} LIKE 'Contoh%'`)
  await db.delete(revenueProperties).where(inArray(revenueProperties.code, PROPERTIES.map((p) => p.code)))
  const [lynk] = await db.select().from(revenueSources).where(eq(revenueSources.code, 'lynk'))
  if (lynk && (lynk.config as Record<string, unknown>)['propertyId']) {
    const config = { ...(lynk.config as Record<string, unknown>) }
    delete config['propertyId']
    await db.update(revenueSources).set({ config }).where(eq(revenueSources.id, lynk.id))
  }
  await db.update(revenueSources).set({ lastSyncAt: null, lastSyncStatus: null }).where(inArray(revenueSources.code, ['adsterra', 'adsense']))
  console.log(`hapus  data contoh pendapatan: ${deleted.length} entri ledger (+ run, webhook, impor, kurs, situs contoh)`)
}

/** Tandai run sync terakhir sumber ini sebagai data contoh (untuk --remove). */
async function markLastRun(runId: string) {
  await db.execute(sql`UPDATE revenue_sync_runs SET log = log || '["[data contoh] dibuat pnpm revenue:demo"]'::jsonb WHERE id = ${runId}`)
}

async function install() {
  await remove()
  const today = dateInZone(new Date(), settings.timeZone)
  const start = addDays(today, -(days - 1))

  // ---------- situs ----------
  const siteRows = await db.select({ id: sites.id, code: sites.code }).from(sites)
  const propertyIds = new Map<string, string>()
  for (const p of PROPERTIES) {
    const created = await repos.revenue.createProperty({ code: p.code, name: p.name, domain: p.domain, siteId: siteRows.find((s) => s.code === p.siteCode)?.id ?? null })
    propertyIds.set(p.code, created.id)
  }
  console.log(`situs  ${PROPERTIES.length} situs contoh`)

  // ---------- kurs contoh USD -> IDR, per awal bulan ----------
  if (settings.baseCurrency === 'IDR') {
    const base = [16380, 16420, 16510, 16590, 16640, 16610, 16700, 16750, 16680, 16720, 16800, 16760, 16820]
    let monthStart = `${start.slice(0, 7)}-01`
    for (let i = 0; monthStart <= today; i++) {
      await repos.revenue.upsertFxRate({ currency: 'USD', rateDate: monthStart, rate: String(base[i % base.length]), note: 'Contoh kurs (bukan kurs resmi)' }, null)
      const [y, m] = monthStart.split('-').map(Number) as [number, number]
      monthStart = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
    }
    console.log('kurs   USD->IDR contoh per bulan')
  } else {
    console.log(`kurs   dilewati (mata uang utama ${settings.baseCurrency}); isi kurs di admin`)
  }

  // ---------- Adsterra + AdSense: sync mock ----------
  for (const code of ['adsterra', 'adsense']) {
    const result = await service.sync(code, { trigger: 'cli', from: start, to: today })
    await markLastRun(result.runId)
    console.log(`sync   ${code}: ${result.status}, ${result.counts.inserted} baris baru${result.error ? `, galat: ${result.error}` : ''}`)
  }

  // ---------- Lynk.id: webhook bertanda tangan ----------
  const lynk = await repos.revenue.requireSource('lynk')
  await db.update(revenueSources).set({ config: { ...lynk.config, propertyId: propertyIds.get('beritakonoha') } }).where(eq(revenueSources.id, lynk.id))
  const key = env[`${lynk.credentialsEnv}_MERCHANT_KEY`] || MOCK_LYNK_MERCHANT_KEY
  const products = [
    { title: 'E-book Panduan SKD CPNS 2026', price: 49000 },
    { title: 'Paket Latihan Soal SKD (500 soal)', price: 99000 },
    { title: 'Template Surat Lamaran & Pernyataan', price: 25000 },
    { title: 'Kelas Online Menulis Berita Daerah', price: 149000 },
  ]
  let orders = 0
  let firstOrderRef = ''
  for (let d = start, n = 0; d <= today; d = addDays(d, 1), n++) {
    const h = unitHash(`lynk:${d}`)
    const count = Math.floor(h * 5) + (n > days / 2 ? 2 : 1) // makin ramai di paruh kedua
    for (let i = 0; i < count; i++) {
      const product = products[Math.floor(unitHash(`lynk:${d}:${i}:p`) * products.length)] ?? products[0]!
      const fee = Math.round(product.price * 0.05 / 500) * 500
      const refId = `DEMO-${d.replaceAll('-', '')}-${i}`
      const hour = String(8 + Math.floor(unitHash(`lynk:${d}:${i}:h`) * 14)).padStart(2, '0')
      const payload = sampleLynkPayload({ refId, messageId: `DEMO_${d}_${i}`, grandTotal: product.price - fee, price: product.price, title: product.title, createdAt: `${d}T${hour}:15:00` })
      const res = await service.handleWebhook('lynk', JSON.stringify(payload), { [LYNK_SIGNATURE_HEADER]: lynkSignature(payload, key) })
      if (res.status !== 200) throw new Error(`webhook contoh ditolak: ${res.status} ${res.body.message ?? ''}`)
      if (!firstOrderRef) firstOrderRef = refId
      orders++
    }
  }
  // Satu pengiriman ulang (message_id beda, order sama) -> tercatat duplicate, saldo tidak bertambah.
  const resend = sampleLynkPayload({ refId: firstOrderRef, messageId: 'DEMO_resend', grandTotal: 46500, price: 49000, title: 'E-book Panduan SKD CPNS 2026', createdAt: `${start}T09:15:00` })
  await service.handleWebhook('lynk', JSON.stringify(resend), { [LYNK_SIGNATURE_HEADER]: lynkSignature(resend, key) })
  const [refundTarget] = await db.select({ id: revenueLedgerEntries.id }).from(revenueLedgerEntries).where(eq(revenueLedgerEntries.externalId, firstOrderRef))
  if (refundTarget) await repos.revenue.createRefund(refundTarget.id, { note: 'Pembeli salah beli produk (contoh)' }, null)
  console.log(`lynk   ${orders} order lewat webhook (+1 kirim ulang, +1 refund)`)

  // ---------- Whop: impor CSV ----------
  const whop = await repos.revenue.requireSource('whop')
  const plans = [
    { name: 'Komunitas Pejuang CPNS Premium (bulanan)', amount: '9.00', site: 'beritakonoha.id' },
    { name: 'Kelas Jurnalisme Data', amount: '29.00', site: 'kabartekno.id' },
    { name: 'Resep Premium Nusantara (bulanan)', amount: '4.99', site: 'resepnusantara.com' },
  ]
  const lines = ['Payment ID,Created At,Product,Amount,Currency,Status,Site']
  for (let d = start, n = 0; d <= today; d = addDays(d, 1), n++) {
    const count = Math.floor(unitHash(`whop:${d}`) * 4) + (n > days / 3 ? 1 : 0)
    for (let i = 0; i < count; i++) {
      const plan = plans[Math.floor(unitHash(`whop:${d}:${i}`) * plans.length)] ?? plans[0]!
      const r = unitHash(`whop:${d}:${i}:s`)
      const status = r < 0.04 ? 'refunded' : r < 0.08 ? 'failed' : 'paid'
      lines.push(`demo_pay_${d.replaceAll('-', '')}_${i},${d}T${String(10 + i).padStart(2, '0')}:05:00Z,"${plan.name}",${plan.amount},USD,${status},${plan.site}`)
    }
  }
  const csv = new TextEncoder().encode(lines.join('\n'))
  const table = parseImportFile('contoh-whop-payments.csv', csv)
  const batchId = await repos.revenue.createImportBatch({ sourceId: whop.id, fileName: 'contoh-whop-payments.csv', format: table.format, sha256: 'contoh', headers: table.headers, rows: table.rows, userId: null })
  const mapping = importMappingSchema.parse({ date: 'Created At', amount: 'Amount', currency: 'Currency', externalId: 'Payment ID', status: 'Status', description: 'Product', property: 'Site' })
  const imported = await repos.revenue.commitImportBatch(batchId, (b) => ({ ...mapImportRows(b.rows, mapping, { sourceCode: whop.code, defaultCurrency: whop.defaultCurrency }), mapping }), null)
  console.log(`whop   impor CSV ${table.rows.length} baris: ${imported.counts.inserted} masuk, ${imported.counts.skipped} dilewati (gagal/duplikat)`)

  // ---------- Lainnya: brand deal + adjustment ----------
  const dealDate = addDays(today, -12)
  await repos.revenue.createManualEntry({ sourceCode: 'lainnya', kind: 'income', reportDate: dealDate, amount: '3500000', currency: 'IDR', description: 'Sponsor rubrik CPNS 1 bulan (contoh)', externalId: `DEMO-sponsor-${dealDate}`, propertyId: propertyIds.get('beritakonoha') }, null)
  await repos.revenue.createManualEntry({ sourceCode: 'lainnya', kind: 'income', reportDate: addDays(today, -40), amount: '1750000', currency: 'IDR', description: 'Artikel bersponsor resep (contoh)', externalId: `DEMO-sponsor-resep`, propertyId: propertyIds.get('resepnusantara') }, null)
  await repos.revenue.createManualEntry({ sourceCode: 'lainnya', kind: 'adjustment', reportDate: dealDate, amount: '-175000', currency: 'IDR', description: 'Potongan PPh sponsor', note: 'Rekonsiliasi bukti potong (contoh)', propertyId: propertyIds.get('beritakonoha') }, null)
  console.log('manual 2 brand deal + 1 adjustment')

  const o = await repos.revenueQueries.overview({ from: start, to: today }, 'month')
  console.log(`selesai: total ${days} hari = ${Number(o.total).toLocaleString('id-ID')} ${o.baseCurrency}; buka http://admin.localhost:3000/admin`)
}

try {
  if (values.remove) await remove()
  else await install()
} finally {
  await db.$client.end()
}
