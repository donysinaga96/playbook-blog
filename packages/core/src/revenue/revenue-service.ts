// Orkestrasi ingest pendapatan (ADR-011): memilih adapter per sumber,
// menjalankan sync (dengan log run), menangani webhook, menguji koneksi.
//
// Kredensial dibaca dari env dengan awalan credentials_env sumbernya:
//   adsterra : <PREFIX>_API_TOKEN
//   adsense  : <PREFIX>_CLIENT_ID, <PREFIX>_CLIENT_SECRET, <PREFIX>_REFRESH_TOKEN (+ config.accountId)
//   lynk     : <PREFIX>_MERCHANT_KEY
// Mode mock: REVENUE_MOCK=true (semua sumber) atau config.mock=true (per
// sumber). Mock memakai fetch palsu berbentuk respons asli, jadi parsing
// dan penulisan ledger tetap lewat kode produksi.
import { EditorError } from '../editor/errors'
import { createAdsenseClient, ADSENSE_METRICS, adsenseToLedger, parseAdsenseReport } from './adapters/adsense'
import { adsterraToLedger, createAdsterraClient, type AdsterraGroup, type FetchLike } from './adapters/adsterra'
import { getHeadlessScraper, headlessGloballyEnabled, runHeadless } from './adapters/headless'
import { LYNK_SIGNATURE_HEADER, lynkSignature, lynkToLedger, parseLynkBody, sampleLynkPayload, verifyLynkSignature } from './adapters/lynk'
import { createMockRevenueFetch, type MockSite } from './adapters/mock-fetch'
import { addDays, addMonths, daysBetween, isIsoDate, startOfMonth } from './dates'
import type { RevenueQueries } from './revenue-queries'
import type { RevenueRepository, RevenueSource } from './revenue-repository'
import { emptyCounts, RevenueError, type LedgerInput, type UpsertCounts } from './types'

export const MOCK_LYNK_MERCHANT_KEY = 'mock-merchant-key'
export const MAX_WEBHOOK_BYTES = 256 * 1024

export interface RevenueRuntime {
  env: Record<string, string | undefined>
  /** fetch sungguhan (globalThis.fetch); diganti fetch palsu dalam mode mock. */
  fetch: FetchLike
  now: () => Date
  /** Situs palsu mode mock (default DEFAULT_MOCK_SITES); diganti di test. */
  mockSites?: MockSite[]
}

export interface SyncSummary {
  runId: string
  status: 'success' | 'partial' | 'failed'
  range: { start: string; end: string }
  mock: boolean
  rowsFetched: number
  counts: UpsertCounts
  error: string | null
}

export interface CredentialStatus {
  /** Nama env var yang dibutuhkan (tanpa nilainya). */
  required: string[]
  missing: string[]
  configured: boolean
}

export interface WebhookResponse {
  status: number
  body: { ok: boolean; status: string; message?: string; entryId?: string | null }
}

export function createRevenueService(deps: { revenue: RevenueRepository; queries: RevenueQueries }, runtime: RevenueRuntime) {
  const { revenue, queries } = deps
  const env = (name: string) => {
    const value = runtime.env[name]
    return value && value.trim() ? value.trim() : undefined
  }

  function isMock(source: RevenueSource): boolean {
    return runtime.env['REVENUE_MOCK'] === 'true' || source.config['mock'] === true
  }

  function credentialNames(source: RevenueSource): string[] {
    const prefix = source.credentialsEnv
    if (!prefix) return []
    if (source.connector === 'adsterra') return [`${prefix}_API_TOKEN`]
    if (source.connector === 'adsense') return [`${prefix}_CLIENT_ID`, `${prefix}_CLIENT_SECRET`, `${prefix}_REFRESH_TOKEN`]
    if (source.connector === 'lynk') return [`${prefix}_MERCHANT_KEY`]
    return []
  }

  function credentialStatus(source: RevenueSource): CredentialStatus {
    const required = credentialNames(source)
    const missing = required.filter((n) => !env(n))
    return { required, missing, configured: missing.length === 0 }
  }

  function fetchFor(source: RevenueSource): FetchLike {
    return isMock(source) ? createMockRevenueFetch({ revision: Number(runtime.env['REVENUE_MOCK_REVISION'] ?? 0) || 0, ...(runtime.mockSites && { sites: runtime.mockSites }) }) : runtime.fetch
  }

  function requireCredentials(source: RevenueSource): void {
    if (isMock(source)) return
    const status = credentialStatus(source)
    if (!status.configured) throw new RevenueError(`kredensial belum diisi di env server: ${status.missing.join(', ')} (atau aktifkan mode mock)`)
  }

  /** Rentang bawaan: jendela lookback (+1 hari agar hari yang keluar jendela ditandai final). */
  function defaultRange(source: RevenueSource, today: string): { start: string; end: string } {
    let start = addDays(today, -(source.lookbackDays + 1))
    if (source.connector === 'adsense') {
      const finalizeDay = Number(source.config['finalizeDay'] ?? 7)
      // Sampai earnings bulan lalu final, bulan lalu ikut ditarik ulang.
      if (Number(today.slice(8, 10)) <= finalizeDay) start = [start, startOfMonth(addMonths(today, -1))].sort()[0] as string
    }
    return { start, end: today }
  }

  async function fetchEntries(source: RevenueSource, range: { start: string; end: string }, today: string, log: (m: string) => void): Promise<LedgerInput[]> {
    const mock = isMock(source)
    if (source.connector === 'adsterra') {
      const client = createAdsterraClient({ token: env(`${source.credentialsEnv}_API_TOKEN`) ?? (mock ? 'mock-token' : ''), fetch: fetchFor(source) })
      const domains = await client.domains()
      log(`domain Adsterra: ${domains.size}`)
      const extra = (source.config['groupBy'] as AdsterraGroup[] | undefined) ?? ['domain', 'placement']
      const stats = await client.stats({ start: range.start, finish: range.end, groupBy: ['date', ...extra] })
      log(`baris stats: ${stats.items.length}${stats.dbDateTime ? ` (data Adsterra per ${stats.dbDateTime})` : ''}`)
      return adsterraToLedger(stats, { today, lookbackDays: source.lookbackDays, currency: source.defaultCurrency, domains })
    }
    if (source.connector === 'adsense') {
      const account = String(source.config['accountId'] ?? (mock ? 'accounts/pub-0000000000000000' : ''))
      if (!account) throw new RevenueError('config.accountId AdSense belum diisi (accounts/pub-XXXXXXXX)')
      const client = createAdsenseClient({
        clientId: env(`${source.credentialsEnv}_CLIENT_ID`) ?? 'mock',
        clientSecret: env(`${source.credentialsEnv}_CLIENT_SECRET`) ?? 'mock',
        refreshToken: env(`${source.credentialsEnv}_REFRESH_TOKEN`) ?? (mock ? 'mock-refresh' : ''),
        fetch: fetchFor(source),
      })
      const json = await client.generateReport({
        account,
        start: range.start,
        end: range.end,
        dimensions: source.config['withDomain'] === false ? ['DATE'] : ['DATE', 'DOMAIN_NAME'],
        metrics: ADSENSE_METRICS,
        reportingTimeZone: String(source.config['reportingTimeZone'] ?? 'ACCOUNT_TIME_ZONE'),
        currencyCode: (source.config['currencyCode'] as string | undefined) ?? null,
      })
      const report = parseAdsenseReport(json)
      log(`baris laporan: ${report.rows.length} dari ${report.totalMatchedRows}; mata uang ${report.currencyCode ?? '-'}`)
      for (const w of report.warnings) log(`peringatan AdSense: ${w}`)
      return adsenseToLedger(report, { today, finalizeDay: Number(source.config['finalizeDay'] ?? 7), fallbackCurrency: source.defaultCurrency })
    }
    if (source.connector === 'headless') {
      if (!headlessGloballyEnabled(runtime.env)) throw new RevenueError('otomasi headless nonaktif (REVENUE_HEADLESS_ENABLED bukan true)')
      if (source.config['enabled'] !== true) throw new RevenueError('otomasi headless sumber ini nonaktif (config.enabled)')
      const key = String(source.config['scraper'] ?? '')
      const scraper = getHeadlessScraper(key)
      if (!scraper) throw new RevenueError(`scraper "${key}" tidak terdaftar`)
      return runHeadless(scraper, { range, config: source.config, env: (n) => env(`${source.credentialsEnv ?? 'REVENUE_HEADLESS'}_${n}`), log })
    }
    throw new RevenueError(`sumber ${source.code} tidak punya jalur tarik otomatis (${source.connector}); pakai impor file atau input manual`)
  }

  const service = {
    isMock,
    credentialStatus,
    defaultRange,

    /** Tarik data satu sumber dan tulis ke ledger; selalu tercatat sebagai run. */
    async sync(code: string, options: { from?: string; to?: string; trigger: 'schedule' | 'manual' | 'cli'; userId?: string | null }): Promise<SyncSummary> {
      const source = await revenue.requireSource(code)
      if (!['adsterra', 'adsense', 'headless'].includes(source.connector)) {
        throw new EditorError('invalid', `${source.name} tidak punya sync otomatis; gunakan impor file, webhook, atau input manual`)
      }
      if (!source.isActive && options.trigger === 'schedule') throw new EditorError('invalid', `${source.name} nonaktif`)
      const today = queries.today()
      const range = options.from && options.to ? { start: options.from, end: options.to } : defaultRange(source, today)
      if (!isIsoDate(range.start) || !isIsoDate(range.end) || range.start > range.end) throw new EditorError('invalid', 'Rentang tanggal sync tidak valid', [{ field: 'from', message: 'Rentang tidak valid' }])
      if (daysBetween(range.start, range.end) > 365) throw new EditorError('invalid', 'Rentang sync maksimum 366 hari', [{ field: 'from', message: 'Maksimum 366 hari' }])
      if (range.end > today) range.end = today

      const mock = isMock(source)
      const channel = source.connector === 'headless' ? 'headless' : 'api'
      const runId = await revenue.startSyncRun({ sourceId: source.id, channel, trigger: options.trigger, rangeStart: range.start, rangeEnd: range.end, mock, userId: options.userId ?? null })
      if (!runId) throw new EditorError('conflict', `Sync ${source.name} sedang berjalan; tunggu sampai selesai`)

      const log: string[] = []
      const write = (m: string) => log.push(`${new Date().toISOString().slice(11, 19)} ${m}`)
      write(`mulai ${range.start} s.d. ${range.end}${mock ? ' (mock)' : ''}`)
      let counts = emptyCounts()
      let rowsFetched = 0
      try {
        requireCredentials(source)
        const entries = await fetchEntries(source, range, today, write)
        rowsFetched = entries.length
        const result = await revenue.upsertEntries(source, entries, { channel, syncRunId: runId, createdBy: options.userId ?? null })
        counts = result.counts
        for (const r of result.results.filter((x) => x.outcome === 'failed').slice(0, 20)) write(`gagal ${r.key}: ${r.reason ?? ''}`)
        write(`selesai: ${counts.inserted} baru, ${counts.updated} diperbarui, ${counts.unchanged} sama, ${counts.skipped} dilewati, ${counts.failed} gagal`)
        const status = counts.failed > 0 ? 'partial' : 'success'
        await revenue.finishSyncRun(runId, source.id, { status, counts, rowsFetched, error: counts.failed ? `${counts.failed} baris gagal ditulis` : null, log })
        return { runId, status, range, mock, rowsFetched, counts, error: null }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        write(`gagal: ${message}`)
        await revenue.finishSyncRun(runId, source.id, { status: 'failed', counts, rowsFetched, error: message, log })
        return { runId, status: 'failed', range, mock, rowsFetched, counts, error: message }
      }
    },

    /** Sumber terjadwal yang sudah waktunya ditarik (dipakai scheduler di server). */
    async dueSources(now: Date): Promise<RevenueSource[]> {
      const sources = await revenue.listSources()
      return sources.filter((s) => {
        if (!s.isActive || !s.syncIntervalMinutes) return false
        if (!['adsterra', 'adsense', 'headless'].includes(s.connector)) return false
        if (s.connector === 'headless' && (!headlessGloballyEnabled(runtime.env) || s.config['enabled'] !== true)) return false
        if (!isMock(s) && !credentialStatus(s).configured) return false
        return !s.lastSyncAt || now.getTime() - s.lastSyncAt.getTime() >= s.syncIntervalMinutes * 60_000
      })
    },

    /** Uji koneksi tanpa menulis ledger. */
    async testConnection(code: string): Promise<{ ok: boolean; mock: boolean; message: string }> {
      const source = await revenue.requireSource(code)
      const mock = isMock(source)
      try {
        requireCredentials(source)
        if (source.connector === 'adsterra') {
          const client = createAdsterraClient({ token: env(`${source.credentialsEnv}_API_TOKEN`) ?? 'mock-token', fetch: fetchFor(source) })
          const domains = await client.domains()
          return { ok: true, mock, message: `Terhubung. ${domains.size} domain: ${[...domains.values()].slice(0, 5).join(', ')}` }
        }
        if (source.connector === 'adsense') {
          const today = queries.today()
          const account = String(source.config['accountId'] ?? (mock ? 'accounts/pub-0000000000000000' : ''))
          if (!account) return { ok: false, mock, message: 'config.accountId belum diisi (accounts/pub-XXXXXXXX)' }
          const client = createAdsenseClient({
            clientId: env(`${source.credentialsEnv}_CLIENT_ID`) ?? 'mock',
            clientSecret: env(`${source.credentialsEnv}_CLIENT_SECRET`) ?? 'mock',
            refreshToken: env(`${source.credentialsEnv}_REFRESH_TOKEN`) ?? 'mock-refresh',
            fetch: fetchFor(source),
          })
          const report = parseAdsenseReport(await client.generateReport({ account, start: today, end: today, dimensions: ['DATE'], metrics: ['ESTIMATED_EARNINGS'] }))
          return { ok: true, mock, message: `OAuth dan laporan OK (${account}); mata uang ${report.currencyCode ?? '-'}` }
        }
        if (source.connector === 'lynk') {
          return { ok: true, mock, message: mock && !env(`${source.credentialsEnv}_MERCHANT_KEY`) ? 'Mode mock: webhook memakai merchant key uji' : 'Merchant key terpasang di env server' }
        }
        if (source.connector === 'headless') {
          if (!headlessGloballyEnabled(runtime.env)) return { ok: false, mock, message: 'REVENUE_HEADLESS_ENABLED bukan true' }
          if (source.config['enabled'] !== true) return { ok: false, mock, message: 'config.enabled sumber ini false' }
          return getHeadlessScraper(String(source.config['scraper'])) ? { ok: true, mock, message: 'Scraper terdaftar' } : { ok: false, mock, message: 'Scraper tidak terdaftar' }
        }
        return { ok: true, mock, message: 'Sumber ini diisi lewat impor file atau input manual' }
      } catch (error) {
        return { ok: false, mock, message: error instanceof Error ? error.message : String(error) }
      }
    },

    /**
     * Webhook masuk. Urutan: sumber dikenal -> ukuran -> bentuk JSON ->
     * merchant key ada -> tanda tangan -> event dipakai -> upsert. Semua
     * request tercatat di revenue_webhook_events; payload hanya disimpan
     * bila tanda tangan sah. Balasan cepat 2xx untuk event yang sudah
     * diterima (termasuk duplikat) agar pengirim tidak mengulang.
     */
    async handleWebhook(code: string, rawBody: string, headers: Record<string, string | undefined>, options: { test?: boolean } = {}): Promise<WebhookResponse> {
      const source = await revenue.getSource(code)
      if (!source || source.connector !== 'lynk') return { status: 404, body: { ok: false, status: 'not-found' } }
      const test = options.test === true
      const reject = async (status: number, state: 'rejected' | 'failed', message: string, signatureValid = false, eventType: string | null = null, externalEventId: string | null = null) => {
        await revenue.recordWebhookEvent({ sourceId: source.id, eventType, externalEventId, signatureValid, status: state, error: message, payload: null, test })
        return { status, body: { ok: false, status: state, message } }
      }
      if (!source.isActive) return reject(503, 'failed', 'sumber nonaktif')
      if (Buffer.byteLength(rawBody, 'utf8') > MAX_WEBHOOK_BYTES) return reject(413, 'rejected', 'payload terlalu besar')
      const parsed = parseLynkBody(rawBody)
      if (parsed.kind === 'invalid') return reject(400, 'rejected', parsed.error)
      const payload = parsed.payload
      const eventType = payload.event
      const messageId = payload.data.message_id
      const merchantKey = env(`${source.credentialsEnv}_MERCHANT_KEY`) ?? (isMock(source) ? MOCK_LYNK_MERCHANT_KEY : undefined)
      // 503 (bukan 4xx): Lynk.id mengulang pengiriman setelah key dipasang.
      if (!merchantKey) return reject(503, 'failed', 'merchant key belum diisi di env server', false, eventType, messageId)
      if (!verifyLynkSignature(payload, headers[LYNK_SIGNATURE_HEADER], merchantKey)) return reject(401, 'rejected', 'tanda tangan X-Lynk-Signature tidak sah', false, eventType, messageId)

      const mapped = lynkToLedger(payload, { timeZone: String(source.config['timezone'] ?? 'Asia/Jakarta'), now: runtime.now() })
      const eventId = await revenue.recordWebhookEvent({ sourceId: source.id, eventType, externalEventId: messageId, signatureValid: true, status: mapped.kind === 'ignored' ? 'ignored' : 'processed', error: mapped.kind === 'ignored' ? mapped.reason : null, payload, test })
      if (mapped.kind === 'ignored') return { status: 200, body: { ok: true, status: 'ignored', message: mapped.reason } }
      // Event uji dari admin: tanda tangan dan mapping diperiksa, ledger tidak diubah.
      if (test) {
        await revenue.finishWebhookEvent(eventId, { status: 'processed', ledgerEntryId: null, error: null })
        return { status: 200, body: { ok: true, status: 'tested', message: `Uji berhasil: order ${mapped.entry.externalId} senilai ${mapped.entry.grossAmount} IDR terbaca (tidak dicatat ke ledger)` } }
      }
      const propertyId = typeof source.config['propertyId'] === 'string' ? source.config['propertyId'] : null
      const result = await revenue.upsertEntries(source, [{ ...mapped.entry, propertyId }], { channel: 'webhook', webhookEventId: eventId })
      const row = result.results[0]
      if (!row || row.outcome === 'failed') {
        await revenue.finishWebhookEvent(eventId, { status: 'failed', ledgerEntryId: null, error: row?.reason ?? 'gagal' })
        return { status: 500, body: { ok: false, status: 'failed', message: 'gagal menyimpan; kirim ulang' } }
      }
      const state = row.outcome === 'unchanged' ? 'duplicate' : row.outcome === 'skipped' ? 'ignored' : 'processed'
      await revenue.finishWebhookEvent(eventId, { status: state, ledgerEntryId: row.entryId, error: row.reason ?? null })
      return { status: 200, body: { ok: true, status: state, entryId: row.entryId } }
    },

    /** Kirim event contoh bertanda tangan ke handler webhook sendiri (tombol uji di admin). */
    async sendTestWebhook(code: string): Promise<WebhookResponse> {
      const source = await revenue.requireSource(code)
      if (source.connector !== 'lynk') throw new EditorError('invalid', 'Uji webhook hanya untuk sumber webhook Lynk.id')
      const merchantKey = env(`${source.credentialsEnv}_MERCHANT_KEY`) ?? (isMock(source) ? MOCK_LYNK_MERCHANT_KEY : undefined)
      if (!merchantKey) throw new EditorError('invalid', `Isi ${source.credentialsEnv}_MERCHANT_KEY di env server, atau aktifkan mode mock`)
      const now = runtime.now()
      const payload = sampleLynkPayload({
        refId: `TEST-${now.getTime().toString(36)}`,
        messageId: `TEST_${now.getTime()}`,
        grandTotal: 72000,
        price: 75000,
        title: 'Produk uji webhook',
        createdAt: new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 19),
      })
      const signature = lynkSignature(payload, merchantKey)
      return service.handleWebhook(code, JSON.stringify(payload), { [LYNK_SIGNATURE_HEADER]: signature }, { test: true })
    },
  }
  return service
}

export type RevenueService = ReturnType<typeof createRevenueService>
