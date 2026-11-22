// Repository pendapatan (ADR-011): satu-satunya jalan tulis ke ledger.
// Semua jalur ingest memanggil upsertEntries, sehingga aturan idempotensi,
// normalisasi kurs, dan pemetaan situs sama untuk webhook, API, impor file,
// headless, dan input manual.
//
// Data pendapatan global (tanpa site_id). Hak akses (hanya superadmin)
// diperiksa lapisan API, bukan di sini.
import {
  and, count, desc, eq, inArray, revenueFxRates, revenueImportBatches, revenueLedgerEntries, revenueProperties, revenueSources,
  revenueSyncRuns, revenueWebhookEvents, sites, sql, type Database, type PgColumn, type SQL,
} from '@framework/db'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { conflict, editorErrorMap, EditorError, invalid, notFound, type FieldIssue } from '../editor/errors'
import type { RepositoryContext } from '../repositories/types'
import { isIsoDate } from './dates'
import { compareDecimal, negate, sum, toDecimal } from './decimal'
import { decideUpsert, normalizeAmount, normalizeDomain, type ExistingEntry } from './ledger-rules'
import { emptyCounts, type ChannelType, type Connector, type LedgerInput, type LedgerStatus, type UpsertCounts, type UpsertOutcome } from './types'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]
type Executor = Database | Tx

export interface RevenueSettings {
  /** Mata uang utama dashboard (REVENUE_BASE_CURRENCY), default IDR. */
  baseCurrency: string
  /** Zona waktu "hari ini" dashboard (REVENUE_TIMEZONE), default Asia/Jakarta. */
  timeZone: string
}

export const DEFAULT_REVENUE_SETTINGS: RevenueSettings = { baseCurrency: 'IDR', timeZone: 'Asia/Jakarta' }

export interface RevenueSource {
  id: string
  code: string
  name: string
  connector: Connector
  integrationType: ChannelType
  isActive: boolean
  defaultCurrency: string
  config: Record<string, unknown>
  credentialsEnv: string | null
  syncIntervalMinutes: number | null
  lookbackDays: number
  sortOrder: number
  lastSyncAt: Date | null
  lastSyncStatus: string | null
  updatedAt: Date
}

export interface RevenueProperty {
  id: string
  code: string
  name: string
  domain: string | null
  siteId: string | null
  siteCode: string | null
  status: 'ACTIVE' | 'ARCHIVED'
  updatedAt: Date
}

export interface UpsertLink {
  channel: ChannelType
  syncRunId?: string | null
  importBatchId?: string | null
  webhookEventId?: string | null
  createdBy?: string | null
  /** Hanya boleh menambah (input manual, refund): kunci yang sudah ada tidak pernah ditimpa. */
  insertOnly?: boolean
}

export interface UpsertResultRow {
  key: string
  outcome: UpsertOutcome | 'failed'
  entryId: string | null
  reason?: string
}

export interface UpsertResult {
  counts: UpsertCounts
  results: UpsertResultRow[]
}

const sourceColumns = {
  id: revenueSources.id,
  code: revenueSources.code,
  name: revenueSources.name,
  connector: revenueSources.connector,
  integrationType: revenueSources.integrationType,
  isActive: revenueSources.isActive,
  defaultCurrency: revenueSources.defaultCurrency,
  config: revenueSources.config,
  credentialsEnv: revenueSources.credentialsEnv,
  syncIntervalMinutes: revenueSources.syncIntervalMinutes,
  lookbackDays: revenueSources.lookbackDays,
  sortOrder: revenueSources.sortOrder,
  lastSyncAt: revenueSources.lastSyncAt,
  lastSyncStatus: revenueSources.lastSyncStatus,
  updatedAt: revenueSources.updatedAt,
}

/** Kolom timestamp dibandingkan pada presisi milidetik (Date JavaScript), bukan mikrodetik PostgreSQL. */
function sameMillis(column: PgColumn, iso: string): SQL {
  return sql`date_trunc('milliseconds', ${column}) = ${new Date(iso).toISOString()}::timestamptz`
}

/** Hasil db.execute (node-postgres) -> baris. */
export async function queryRows<T>(db: Executor, query: SQL): Promise<T[]> {
  const result = (await db.execute(query)) as unknown as { rows: T[] }
  return result.rows
}

function zodIssues(error: z.ZodError): FieldIssue[] {
  return error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
}

function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input, { error: editorErrorMap })
  if (!parsed.success) throw invalid(zodIssues(parsed.error))
  return parsed.data
}

// ---------- config sumber (non-rahasia) ------------------------------

const SECRET_KEY = /(token|secret|password|passwd|api[_-]?key|merchant[_-]?key|refresh)/i

const configSchemas: Record<Connector, z.ZodType<Record<string, unknown>>> = {
  adsense: z.object({
    accountId: z.string().regex(/^accounts\/pub-\d+$/, 'bentuk: accounts/pub-XXXXXXXX').optional(),
    reportingTimeZone: z.enum(['ACCOUNT_TIME_ZONE', 'GOOGLE_TIME_ZONE']).default('ACCOUNT_TIME_ZONE'),
    finalizeDay: z.number().int().min(1).max(28).default(7),
    currencyCode: z.string().regex(/^[A-Z]{3}$/).optional(),
    withDomain: z.boolean().default(true),
    mock: z.boolean().optional(),
  }).strict(),
  adsterra: z.object({
    groupBy: z.array(z.enum(['domain', 'placement', 'country', 'placement_sub_id'])).max(2).default(['domain', 'placement']),
    mock: z.boolean().optional(),
  }).strict(),
  lynk: z.object({
    timezone: z.string().min(1).default('Asia/Jakarta'),
    propertyId: z.uuid().optional(),
  }).strict(),
  headless: z.object({
    enabled: z.boolean().default(false),
    scraper: z.string().min(1).max(60).default('mock'),
  }).strict(),
  generic: z.object({}).strict(),
}

export function validateSourceConfig(connector: Connector, config: unknown): Record<string, unknown> {
  if (config && typeof config === 'object') {
    const secret = Object.keys(config).find((k) => SECRET_KEY.test(k))
    if (secret) throw invalid([{ field: `config.${secret}`, message: 'Rahasia tidak boleh disimpan di database; isi lewat env server' }])
  }
  const parsed = configSchemas[connector].safeParse(config ?? {}, { error: editorErrorMap })
  if (!parsed.success) throw invalid(parsed.error.issues.map((i) => ({ field: `config.${i.path.join('.')}`, message: i.message })))
  return parsed.data
}

const sourceUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  isActive: z.boolean().optional(),
  defaultCurrency: z.string().regex(/^[A-Z]{3}$/, 'Kode mata uang 3 huruf').optional(),
  syncIntervalMinutes: z.number().int().min(15).max(10080).nullable().optional(),
  lookbackDays: z.number().int().min(0).max(60).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  updatedAt: z.string().min(1),
})

const sourceCreateSchema = z.object({
  code: z.string().regex(/^[a-z0-9]+(_[a-z0-9]+)*$/, 'huruf kecil, angka, garis bawah').max(40),
  name: z.string().trim().min(1).max(80),
  connector: z.enum(['generic', 'headless']),
  integrationType: z.enum(['csv_import', 'manual', 'headless']),
  defaultCurrency: z.string().regex(/^[A-Z]{3}$/, 'Kode mata uang 3 huruf'),
})

const propertySchema = z.object({
  code: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'huruf kecil, angka, tanda hubung').max(50),
  name: z.string().trim().min(1).max(120),
  domain: z.string().trim().max(253).nullish(),
  siteId: z.uuid().nullish(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).default('ACTIVE'),
})

const fxSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/, 'Kode mata uang 3 huruf'),
  rateDate: z.string().refine(isIsoDate, 'Tanggal YYYY-MM-DD'),
  rate: z.string().regex(/^\d+(\.\d{1,8})?$/, 'Angka positif, maksimal 8 desimal').refine((v) => compareDecimal(v, '0') > 0, 'Harus lebih dari 0'),
  note: z.string().trim().max(200).nullish(),
})

const manualSchema = z.object({
  sourceCode: z.string().min(1),
  propertyId: z.uuid().nullish(),
  reportDate: z.string().refine(isIsoDate, 'Tanggal YYYY-MM-DD'),
  amount: z.string().trim().regex(/^-?\d+(\.\d{1,6})?$/, 'Angka dengan titik desimal, mis. 1500000 atau 12.50'),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Kode mata uang 3 huruf'),
  kind: z.enum(['income', 'adjustment']),
  status: z.enum(['estimated', 'finalized']).default('finalized'),
  description: z.string().trim().min(1).max(500),
  note: z.string().trim().max(2000).nullish(),
  externalId: z.string().trim().max(200).nullish(),
  adjustsEntryId: z.uuid().nullish(),
})

const refundSchema = z.object({
  amount: z.string().trim().regex(/^\d+(\.\d{1,6})?$/, 'Angka positif').nullish(),
  note: z.string().trim().min(1).max(2000),
})

export type ManualEntryInput = z.input<typeof manualSchema>

// ---------- repository ---------------------------------------------

export function createRevenueRepository(ctx: RepositoryContext, settings: RevenueSettings = DEFAULT_REVENUE_SETTINGS) {
  const { db } = ctx
  const base = settings.baseCurrency

  async function propertyDomainMap(executor: Executor): Promise<Map<string, string>> {
    const rows = await executor.select({ id: revenueProperties.id, domain: revenueProperties.domain }).from(revenueProperties)
    return new Map(rows.filter((r) => r.domain).map((r) => [r.domain as string, r.id]))
  }

  /** Kurs terakhir <= tanggal; '1' untuk mata uang utama; null bila belum ada. */
  function fxResolver(executor: Executor) {
    const cache = new Map<string, string | null>()
    return async (currency: string, date: string): Promise<string | null> => {
      if (currency === base) return '1'
      const key = `${currency}|${date}`
      if (cache.has(key)) return cache.get(key) ?? null
      const [row] = await executor
        .select({ rate: revenueFxRates.rateToBase })
        .from(revenueFxRates)
        .where(and(eq(revenueFxRates.currency, currency), eq(revenueFxRates.baseCurrency, base), sql`${revenueFxRates.rateDate} <= ${date}`))
        .orderBy(desc(revenueFxRates.rateDate))
        .limit(1)
      const rate = row?.rate ?? null
      cache.set(key, rate)
      return rate
    }
  }

  function validateEntry(input: LedgerInput): string | null {
    if (!input.idempotencyKey || input.idempotencyKey.length > 300) return 'idempotency_key kosong atau terlalu panjang'
    if (!isIsoDate(input.reportDate)) return `tanggal laporan tidak valid: ${input.reportDate}`
    if (!/^[A-Z]{3}$/.test(input.currency)) return `mata uang tidak valid: ${input.currency}`
    try {
      toDecimal(input.grossAmount)
    } catch {
      return `nominal tidak valid: ${input.grossAmount}`
    }
    if ((input.status === 'adjusted' || input.status === 'refunded') && !input.note?.trim()) return 'koreksi/refund wajib punya alasan'
    if (input.status === 'refunded' && compareDecimal(input.grossAmount, '0') >= 0) return 'refund harus bernilai negatif'
    return null
  }

  /**
   * Upsert banyak entri dalam transaksi `executor`. Setiap baris memakai
   * savepoint: satu baris gagal (mis. constraint) tidak membatalkan yang lain.
   */
  async function upsertWithin(executor: Tx, source: Pick<RevenueSource, 'id'>, inputs: LedgerInput[], link: UpsertLink): Promise<UpsertResult> {
    const counts = emptyCounts()
    const results: UpsertResultRow[] = []
    const domains = await propertyDomainMap(executor)
    const fx = fxResolver(executor)

    for (const input of inputs) {
      const problem = validateEntry(input)
      if (problem) {
        counts.failed++
        results.push({ key: input.idempotencyKey, outcome: 'failed', entryId: null, reason: problem })
        continue
      }
      const grossAmount = toDecimal(input.grossAmount)
      const propertyId = input.propertyId ?? (input.propertyDomain ? (domains.get(input.propertyDomain) ?? null) : null)
      const rate = await fx(input.currency, input.reportDate)
      const { fxRate, normalized } = normalizeAmount(grossAmount, input.currency, base, rate)
      const values = {
        propertyId,
        externalId: input.externalId ?? null,
        occurredAt: input.occurredAt ?? null,
        reportDate: input.reportDate,
        grossAmount,
        currency: input.currency,
        fxRateToBase: fxRate,
        normalizedAmount: normalized,
        status: input.status,
        metricsJson: input.metrics ?? {},
        dimensions: input.dimensions ?? {},
        description: input.description ?? null,
        note: input.note ?? null,
        rawPayload: input.rawPayload === undefined ? null : input.rawPayload,
        adjustsEntryId: input.adjustsEntryId ?? null,
        syncRunId: link.syncRunId ?? null,
        importBatchId: link.importBatchId ?? null,
        webhookEventId: link.webhookEventId ?? null,
      }
      try {
        const row = await executor.transaction(async (sp) => {
          const findExisting = async () => {
            const [found] = await sp
              .select({
                id: revenueLedgerEntries.id,
                status: revenueLedgerEntries.status,
                grossAmount: revenueLedgerEntries.grossAmount,
                currency: revenueLedgerEntries.currency,
                metrics: revenueLedgerEntries.metricsJson,
                dimensions: revenueLedgerEntries.dimensions,
                propertyId: revenueLedgerEntries.propertyId,
              })
              .from(revenueLedgerEntries)
              .where(and(eq(revenueLedgerEntries.sourceId, source.id), eq(revenueLedgerEntries.idempotencyKey, input.idempotencyKey)))
              .limit(1)
              .for('update')
            return found
          }
          let existing = await findExisting()
          if (!existing) {
            const inserted = await sp
              .insert(revenueLedgerEntries)
              .values({ ...values, sourceId: source.id, channelType: link.channel, idempotencyKey: input.idempotencyKey, baseCurrency: base, createdBy: link.createdBy ?? null })
              .onConflictDoNothing()
              .returning({ id: revenueLedgerEntries.id })
            if (inserted[0]) return { key: input.idempotencyKey, outcome: 'inserted' as const, entryId: inserted[0].id }
            existing = await findExisting() // kalah balapan dengan pengiriman paralel
            if (!existing) throw new Error('entri tidak ditemukan setelah konflik')
          }
          if (link.insertOnly) return { key: input.idempotencyKey, outcome: 'skipped' as const, entryId: existing.id, reason: 'kunci sudah ada; entri lama tidak diubah' }
          const decision = decideUpsert(
            { ...existing, status: existing.status as LedgerStatus, metrics: existing.metrics as Record<string, unknown>, dimensions: existing.dimensions as Record<string, unknown> } satisfies ExistingEntry,
            { ...input, grossAmount },
            propertyId,
          )
          if (decision.action === 'skip') return { key: input.idempotencyKey, outcome: 'skipped' as const, entryId: existing.id, reason: decision.reason }
          if (decision.action === 'unchanged' || decision.action === 'insert') return { key: input.idempotencyKey, outcome: 'unchanged' as const, entryId: existing.id }
          await sp.update(revenueLedgerEntries).set(values).where(eq(revenueLedgerEntries.id, existing.id))
          return { key: input.idempotencyKey, outcome: 'updated' as const, entryId: existing.id }
        })
        counts[row.outcome]++
        results.push(row)
      } catch (error) {
        counts.failed++
        results.push({ key: input.idempotencyKey, outcome: 'failed', entryId: null, reason: error instanceof Error ? error.message.slice(0, 300) : 'galat' })
      }
    }
    return { counts, results }
  }

  /** Tulis entri dari satu sumber dalam satu transaksi (savepoint per baris). */
  async function upsertEntries(source: Pick<RevenueSource, 'id'>, inputs: LedgerInput[], link: UpsertLink): Promise<UpsertResult> {
    return db.transaction((tx) => upsertWithin(tx, source, inputs, link))
  }

  async function getSourceRow(executor: Executor, where: SQL): Promise<RevenueSource | null> {
    const [row] = await executor.select(sourceColumns).from(revenueSources).where(where).limit(1)
    return (row as RevenueSource | undefined) ?? null
  }

  async function requireSource(code: string): Promise<RevenueSource> {
    const source = await getSourceRow(db, eq(revenueSources.code, code))
    if (!source) throw notFound('Sumber pendapatan')
    return source
  }

  /** Hubungkan entri tanpa properti ke properti berdomain sama (setelah properti dibuat/diubah). */
  async function linkUnassigned(executor: Executor, propertyId: string, domain: string | null): Promise<number> {
    if (!domain) return 0
    const rows = await queryRows<{ id: string }>(executor, sql`
      UPDATE revenue_ledger_entries SET property_id = ${propertyId}
       WHERE property_id IS NULL
         AND regexp_replace(lower(dimensions->>'domain'), '^([a-z][a-z0-9+.-]*://)?(www\\.)?', '') = ${domain}
      RETURNING id`)
    return rows.length
  }

  return {
    settings,

    // ---------- sumber ----------
    async listSources(): Promise<RevenueSource[]> {
      const rows = await db.select(sourceColumns).from(revenueSources).orderBy(revenueSources.sortOrder, revenueSources.name)
      return rows as RevenueSource[]
    },

    async getSource(code: string): Promise<RevenueSource | null> {
      return getSourceRow(db, eq(revenueSources.code, code))
    },

    async getSourceById(id: string): Promise<RevenueSource | null> {
      return getSourceRow(db, eq(revenueSources.id, id))
    },

    requireSource,

    async createSource(input: unknown): Promise<RevenueSource> {
      const data = parseInput(sourceCreateSchema, input)
      const [max] = await queryRows<{ n: number }>(db, sql`SELECT coalesce(max(sort_order), 0)::int AS n FROM revenue_sources WHERE sort_order < 9`)
      const inserted = await db
        .insert(revenueSources)
        .values({ ...data, config: data.connector === 'headless' ? { enabled: false, scraper: 'mock' } : {}, sortOrder: Math.min((max?.n ?? 0) + 1, 8) })
        .onConflictDoNothing()
        .returning(sourceColumns)
      if (!inserted[0]) throw invalid([{ field: 'code', message: 'Kode sumber sudah dipakai' }])
      return inserted[0] as RevenueSource
    },

    async updateSource(code: string, input: unknown): Promise<RevenueSource> {
      const data = parseInput(sourceUpdateSchema, input)
      const source = await requireSource(code)
      if (Number.isNaN(Date.parse(data.updatedAt))) throw invalid([{ field: 'updatedAt', message: 'Token versi tidak valid' }])
      const config = data.config === undefined ? undefined : validateSourceConfig(source.connector, data.config)
      const [row] = await db
        .update(revenueSources)
        .set({
          ...(data.name !== undefined && { name: data.name }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
          ...(data.defaultCurrency !== undefined && { defaultCurrency: data.defaultCurrency }),
          ...(data.syncIntervalMinutes !== undefined && { syncIntervalMinutes: data.syncIntervalMinutes }),
          ...(data.lookbackDays !== undefined && { lookbackDays: data.lookbackDays }),
          ...(config !== undefined && { config }),
        })
        .where(and(eq(revenueSources.id, source.id), sameMillis(revenueSources.updatedAt, data.updatedAt)))
        .returning(sourceColumns)
      if (!row) throw conflict('Sumber pendapatan')
      return row as RevenueSource
    },

    // ---------- properti (situs) ----------
    async listProperties(): Promise<RevenueProperty[]> {
      const rows = await db
        .select({
          id: revenueProperties.id, code: revenueProperties.code, name: revenueProperties.name, domain: revenueProperties.domain,
          siteId: revenueProperties.linkedSiteId, siteCode: sites.code, status: revenueProperties.status, updatedAt: revenueProperties.updatedAt,
        })
        .from(revenueProperties)
        .leftJoin(sites, eq(sites.id, revenueProperties.linkedSiteId))
        .orderBy(revenueProperties.name)
      return rows as RevenueProperty[]
    },

    async createProperty(input: unknown): Promise<RevenueProperty & { linkedEntries: number }> {
      const data = parseInput(propertySchema, input)
      const domain = data.domain ? normalizeDomain(data.domain) : null
      if (data.domain && !domain) throw invalid([{ field: 'domain', message: 'Domain tidak valid, mis. contoh.com' }])
      return db.transaction(async (tx) => {
        const inserted = await tx
          .insert(revenueProperties)
          .values({ code: data.code, name: data.name, domain, linkedSiteId: data.siteId ?? null, status: data.status })
          .onConflictDoNothing()
          .returning({ id: revenueProperties.id })
        if (!inserted[0]) throw invalid([{ field: 'code', message: 'Kode atau domain sudah dipakai situs lain' }])
        const linkedEntries = await linkUnassigned(tx, inserted[0].id, domain)
        const [row] = await tx.select({
          id: revenueProperties.id, code: revenueProperties.code, name: revenueProperties.name, domain: revenueProperties.domain,
          siteId: revenueProperties.linkedSiteId, siteCode: sites.code, status: revenueProperties.status, updatedAt: revenueProperties.updatedAt,
        }).from(revenueProperties).leftJoin(sites, eq(sites.id, revenueProperties.linkedSiteId)).where(eq(revenueProperties.id, inserted[0].id))
        return { ...(row as RevenueProperty), linkedEntries }
      })
    },

    async updateProperty(id: string, input: unknown): Promise<{ linkedEntries: number }> {
      const data = parseInput(propertySchema.extend({ updatedAt: z.string().min(1) }), input)
      const domain = data.domain ? normalizeDomain(data.domain) : null
      if (data.domain && !domain) throw invalid([{ field: 'domain', message: 'Domain tidak valid, mis. contoh.com' }])
      return db.transaction(async (tx) => {
        const updated = await tx
          .update(revenueProperties)
          .set({ code: data.code, name: data.name, domain, linkedSiteId: data.siteId ?? null, status: data.status })
          .where(and(eq(revenueProperties.id, id), sameMillis(revenueProperties.updatedAt, data.updatedAt)))
          .returning({ id: revenueProperties.id })
          .catch((e: unknown) => {
            if ((e as { cause?: { code?: string } }).cause?.code === '23505' || (e as { code?: string }).code === '23505') throw invalid([{ field: 'domain', message: 'Kode atau domain sudah dipakai situs lain' }])
            throw e
          })
        if (!updated[0]) throw conflict('Situs')
        return { linkedEntries: await linkUnassigned(tx, id, domain) }
      })
    },

    // ---------- kurs ----------
    async listFxRates(): Promise<{ currency: string; rateDate: string; rate: string; note: string | null; updatedAt: Date }[]> {
      return db
        .select({ currency: revenueFxRates.currency, rateDate: revenueFxRates.rateDate, rate: revenueFxRates.rateToBase, note: revenueFxRates.note, updatedAt: revenueFxRates.updatedAt })
        .from(revenueFxRates)
        .where(eq(revenueFxRates.baseCurrency, base))
        .orderBy(revenueFxRates.currency, desc(revenueFxRates.rateDate))
    },

    async upsertFxRate(input: unknown, userId: string | null): Promise<void> {
      const data = parseInput(fxSchema, input)
      if (data.currency === base) throw invalid([{ field: 'currency', message: `${base} adalah mata uang utama (kurs selalu 1)` }])
      await db
        .insert(revenueFxRates)
        .values({ currency: data.currency, baseCurrency: base, rateDate: data.rateDate, rateToBase: data.rate, note: data.note ?? null, createdBy: userId })
        .onConflictDoUpdate({ target: [revenueFxRates.currency, revenueFxRates.baseCurrency, revenueFxRates.rateDate], set: { rateToBase: data.rate, note: data.note ?? null } })
    },

    async deleteFxRate(currency: string, rateDate: string): Promise<void> {
      await db.delete(revenueFxRates).where(and(eq(revenueFxRates.currency, currency), eq(revenueFxRates.baseCurrency, base), eq(revenueFxRates.rateDate, rateDate)))
    },

    /**
     * Isi konversi yang masih kosong (mode 'missing'), atau hitung ulang
     * semua entri mata uang tertentu dalam rentang (mode 'range'; perubahan
     * kurs tercatat sebagai revisi oleh trigger).
     */
    async recomputeFx(input: { mode: 'missing' } | { mode: 'range'; currency: string; from: string; to: string }): Promise<number> {
      // Koreksi/refund manual hanya diisi bila kursnya masih kosong; mode
      // rentang tidak mengubah kurs yang sudah dipakai koreksi manual.
      const filter = input.mode === 'missing'
        ? sql`e.normalized_amount IS NULL`
        : sql`e.currency = ${input.currency} AND e.report_date BETWEEN ${input.from}::date AND ${input.to}::date AND e.status NOT IN ('adjusted', 'refunded')`
      const rows = await queryRows<{ id: string }>(db, sql`
        WITH r AS (
          SELECT e.id,
                 (SELECT f.rate_to_base FROM revenue_fx_rates f
                   WHERE f.currency = e.currency AND f.base_currency = e.base_currency AND f.rate_date <= e.report_date
                   ORDER BY f.rate_date DESC LIMIT 1) AS rate
            FROM revenue_ledger_entries e
           WHERE ${filter} AND e.currency <> e.base_currency
        )
        UPDATE revenue_ledger_entries e
           SET fx_rate_to_base = r.rate, normalized_amount = round(e.gross_amount * r.rate, 2)
          FROM r
         WHERE e.id = r.id AND r.rate IS NOT NULL AND e.fx_rate_to_base IS DISTINCT FROM r.rate
        RETURNING e.id`)
      return rows.length
    },

    // ---------- ledger ----------
    upsertEntries,

    upsertWithin,

    /** Pemasukan manual (brand deal, dll.) atau adjustment rekonsiliasi; selalu dengan jejak pembuat. */
    async createManualEntry(input: unknown, userId: string | null): Promise<{ entryId: string }> {
      const data = parseInput(manualSchema, input)
      const source = await requireSource(data.sourceCode)
      if (data.kind === 'adjustment' && !data.note?.trim()) throw invalid([{ field: 'note', message: 'Alasan adjustment wajib diisi' }])
      if (data.kind === 'income' && compareDecimal(data.amount, '0') <= 0) throw invalid([{ field: 'amount', message: 'Pemasukan harus lebih dari 0; pakai adjustment untuk koreksi negatif' }])
      if (data.adjustsEntryId) {
        const [target] = await db.select({ id: revenueLedgerEntries.id }).from(revenueLedgerEntries).where(eq(revenueLedgerEntries.id, data.adjustsEntryId)).limit(1)
        if (!target) throw invalid([{ field: 'adjustsEntryId', message: 'Entri yang dikoreksi tidak ditemukan' }])
      }
      const key = data.externalId ? `manual:ext:${data.externalId}` : `${data.kind === 'adjustment' ? 'adjustment' : 'manual'}:${randomUUID()}`
      const result = await upsertEntries(source, [{
        idempotencyKey: key,
        externalId: data.externalId ?? null,
        reportDate: data.reportDate,
        grossAmount: data.amount,
        currency: data.currency,
        status: data.kind === 'adjustment' ? 'adjusted' : data.status,
        description: data.description,
        note: data.note ?? null,
        propertyId: data.propertyId ?? null,
        adjustsEntryId: data.adjustsEntryId ?? null,
      }], { channel: 'manual', createdBy: userId, insertOnly: true })
      const row = result.results[0]
      if (!row || row.outcome === 'failed') throw invalid([{ field: '', message: row?.reason ?? 'Gagal menyimpan' }])
      if (row.outcome !== 'inserted') throw invalid([{ field: 'externalId', message: 'ID eksternal ini sudah pernah dicatat' }])
      return { entryId: row.entryId as string }
    },

    /** Refund atas entri pemasukan (penuh atau sebagian); total refund tidak boleh melebihi nominal asal. */
    async createRefund(entryId: string, input: unknown, userId: string | null): Promise<{ entryId: string }> {
      const data = parseInput(refundSchema, input)
      return db.transaction(async (tx) => {
        const [entry] = await tx.select().from(revenueLedgerEntries).where(eq(revenueLedgerEntries.id, entryId)).limit(1).for('update')
        if (!entry) throw notFound('Entri')
        if (entry.status === 'refunded' || entry.status === 'adjusted' || compareDecimal(entry.grossAmount, '0') <= 0) {
          throw invalid([{ field: '', message: 'Hanya pemasukan positif yang bisa di-refund' }])
        }
        const prior = await tx
          .select({ amount: revenueLedgerEntries.grossAmount })
          .from(revenueLedgerEntries)
          .where(and(eq(revenueLedgerEntries.adjustsEntryId, entryId), eq(revenueLedgerEntries.status, 'refunded')))
        const refunded = negate(sum(prior.map((p) => p.amount), 6)) // positif
        const amount = data.amount ?? toDecimal(sum([entry.grossAmount, negate(refunded)], 6))
        if (compareDecimal(amount, '0') <= 0) throw invalid([{ field: 'amount', message: 'Entri ini sudah di-refund penuh' }])
        if (compareDecimal(sum([refunded, amount], 6), entry.grossAmount) > 0) throw invalid([{ field: 'amount', message: 'Total refund melebihi nominal entri' }])
        const result = await upsertWithin(tx, { id: entry.sourceId }, [{
          idempotencyKey: `refund:${entryId}:${prior.length + 1}`,
          reportDate: entry.reportDate,
          grossAmount: negate(amount),
          currency: entry.currency,
          status: 'refunded',
          description: `Refund: ${entry.description ?? entry.externalId ?? entry.idempotencyKey}`.slice(0, 500),
          note: data.note,
          propertyId: entry.propertyId,
          dimensions: entry.dimensions as Record<string, string>,
          adjustsEntryId: entryId,
          externalId: entry.externalId,
        }], { channel: 'manual', createdBy: userId, insertOnly: true })
        const row = result.results[0]
        if (!row || row.outcome !== 'inserted') throw invalid([{ field: '', message: row?.reason ?? 'Gagal mencatat refund' }])
        return { entryId: row.entryId as string }
      })
    },

    // ---------- sync run ----------
    /**
     * Mulai satu run; null bila sumber ini sedang berjalan (index unik
     * status running). Run yang macet > 30 menit ditutup sebagai gagal dulu.
     */
    async startSyncRun(input: { sourceId: string; channel: 'api' | 'headless'; trigger: 'schedule' | 'manual' | 'cli'; rangeStart: string; rangeEnd: string; mock: boolean; userId: string | null }): Promise<string | null> {
      await db.execute(sql`
        UPDATE revenue_sync_runs SET status = 'failed', finished_at = now(), error_message = 'run tidak selesai (proses berhenti?)'
         WHERE source_id = ${input.sourceId} AND status = 'running' AND started_at < now() - interval '30 minutes'`)
      const rows = await db
        .insert(revenueSyncRuns)
        .values({ sourceId: input.sourceId, channelType: input.channel, trigger: input.trigger, rangeStart: input.rangeStart, rangeEnd: input.rangeEnd, mock: input.mock, triggeredBy: input.userId })
        .onConflictDoNothing()
        .returning({ id: revenueSyncRuns.id })
      return rows[0]?.id ?? null
    },

    async finishSyncRun(runId: string, sourceId: string, result: { status: 'success' | 'partial' | 'failed'; counts: UpsertCounts; rowsFetched: number; error: string | null; log: string[] }): Promise<void> {
      await db.transaction(async (tx) => {
        await tx.update(revenueSyncRuns).set({
          status: result.status,
          finishedAt: sql`now()`,
          rowsFetched: result.rowsFetched,
          ...result.counts,
          errorMessage: result.error?.slice(0, 2000) ?? null,
          log: result.log.slice(-200).map((l) => l.slice(0, 500)),
        }).where(eq(revenueSyncRuns.id, runId))
        await tx.update(revenueSources).set({ lastSyncAt: sql`now()`, lastSyncStatus: result.status }).where(eq(revenueSources.id, sourceId))
      })
    },

    // ---------- webhook ----------
    async recordWebhookEvent(input: { sourceId: string; eventType: string | null; externalEventId: string | null; signatureValid: boolean; status: 'processed' | 'duplicate' | 'ignored' | 'rejected' | 'failed'; error: string | null; payload: unknown; test: boolean }): Promise<string> {
      const [row] = await db.insert(revenueWebhookEvents).values({
        sourceId: input.sourceId,
        eventType: input.eventType?.slice(0, 100) ?? null,
        externalEventId: input.externalEventId?.slice(0, 200) ?? null,
        signatureValid: input.signatureValid,
        status: input.status,
        error: input.error?.slice(0, 1000) ?? null,
        payload: input.signatureValid ? (input.payload ?? null) : null,
        test: input.test,
      }).returning({ id: revenueWebhookEvents.id })
      if (!row) throw new Error('insert webhook event gagal')
      return row.id
    },

    async finishWebhookEvent(id: string, input: { status: 'processed' | 'duplicate' | 'ignored' | 'failed'; ledgerEntryId: string | null; error: string | null }): Promise<void> {
      await db.update(revenueWebhookEvents).set({ status: input.status, ledgerEntryId: input.ledgerEntryId, error: input.error?.slice(0, 1000) ?? null }).where(eq(revenueWebhookEvents.id, id))
    },

    // ---------- impor file ----------
    async createImportBatch(input: { sourceId: string; fileName: string; format: 'csv' | 'xlsx' | 'json'; sha256: string; headers: string[]; rows: Record<string, string>[]; userId: string | null }): Promise<string> {
      // Batch yang ditinggal di tengah wizard > 24 jam dibuang (baris mentahnya ikut dihapus).
      await db.update(revenueImportBatches).set({ status: 'discarded', rows: null })
        .where(and(eq(revenueImportBatches.status, 'uploaded'), sql`${revenueImportBatches.createdAt} < now() - interval '24 hours'`))
      const [row] = await db.insert(revenueImportBatches).values({
        sourceId: input.sourceId,
        fileName: input.fileName.slice(0, 255) || 'tanpa-nama',
        fileFormat: input.format,
        fileSha256: input.sha256,
        headers: input.headers,
        rows: input.rows,
        rowCount: input.rows.length,
        createdBy: input.userId,
      }).returning({ id: revenueImportBatches.id })
      if (!row) throw new Error('insert batch impor gagal')
      return row.id
    },

    async getImportBatch(id: string) {
      const [row] = await db.select().from(revenueImportBatches).where(eq(revenueImportBatches.id, id)).limit(1)
      if (!row) throw notFound('Batch impor')
      return row
    },

    /** Batch lain dari sumber yang sama dengan isi file identik (peringatan impor ulang). */
    async findSameFile(sourceId: string, sha256: string, exceptId: string) {
      return db
        .select({ id: revenueImportBatches.id, fileName: revenueImportBatches.fileName, status: revenueImportBatches.status, createdAt: revenueImportBatches.createdAt })
        .from(revenueImportBatches)
        .where(and(eq(revenueImportBatches.sourceId, sourceId), eq(revenueImportBatches.fileSha256, sha256), sql`${revenueImportBatches.id} <> ${exceptId}`))
        .orderBy(desc(revenueImportBatches.createdAt))
        .limit(5)
    },

    /**
     * Commit batch: kunci batch (hanya status uploaded), upsert entri hasil
     * mapping, simpan ringkasan + galat per baris, buang baris mentah.
     */
    async commitImportBatch(id: string, build: (batch: { sourceId: string; rows: Record<string, string>[] }) => { entries: { row: number; entry: LedgerInput }[]; errors: { row: number; message: string }[]; duplicates: { row: number; message: string }[]; mapping: unknown }, userId: string | null) {
      return db.transaction(async (tx) => {
        const [batch] = await tx.select().from(revenueImportBatches).where(eq(revenueImportBatches.id, id)).limit(1).for('update')
        if (!batch) throw notFound('Batch impor')
        if (batch.status !== 'uploaded' || !batch.rows) throw new EditorError('conflict', 'Batch ini sudah di-commit atau dibuang')
        const mapped = build({ sourceId: batch.sourceId, rows: batch.rows as Record<string, string>[] })
        const result = await upsertWithin(tx, { id: batch.sourceId }, mapped.entries.map((e) => e.entry), { channel: 'csv_import', importBatchId: id, createdBy: userId })
        const rowErrors = [
          ...mapped.errors,
          ...result.results.flatMap((r, i) => (r.outcome === 'failed' ? [{ row: mapped.entries[i]?.row ?? 0, message: r.reason ?? 'gagal' }] : [])),
        ]
        const skippedNotes = [
          ...mapped.duplicates,
          ...result.results.flatMap((r, i) => (r.outcome === 'skipped' ? [{ row: mapped.entries[i]?.row ?? 0, message: r.reason ?? 'dilewati' }] : [])),
        ]
        const counts = {
          inserted: result.counts.inserted,
          updated: result.counts.updated,
          unchanged: result.counts.unchanged,
          skipped: result.counts.skipped + mapped.duplicates.length,
          failed: result.counts.failed + mapped.errors.length,
        }
        await tx.update(revenueImportBatches).set({
          status: 'committed',
          committedAt: sql`now()`,
          rows: null,
          mapping: mapped.mapping,
          ...counts,
          errors: [...rowErrors, ...skippedNotes.map((s) => ({ ...s, skipped: true }))].sort((a, b) => a.row - b.row).slice(0, 500),
        }).where(eq(revenueImportBatches.id, id))
        return { counts, errors: rowErrors.slice(0, 200), skipped: skippedNotes.slice(0, 200) }
      })
    },

    /** Berapa kunci yang sudah ada di ledger sumber ini (perkiraan baru vs sudah ada di pratinjau impor). */
    async countExistingKeys(sourceId: string, keys: string[]): Promise<number> {
      let total = 0
      // Dipecah agar jumlah parameter tetap di bawah batas PostgreSQL (65535).
      for (let i = 0; i < keys.length; i += 5000) {
        const [row] = await db
          .select({ n: count() })
          .from(revenueLedgerEntries)
          .where(and(eq(revenueLedgerEntries.sourceId, sourceId), inArray(revenueLedgerEntries.idempotencyKey, keys.slice(i, i + 5000))))
        total += Number(row?.n ?? 0)
      }
      return total
    },

    async discardImportBatch(id: string): Promise<void> {
      const rows = await db.update(revenueImportBatches).set({ status: 'discarded', rows: null })
        .where(and(eq(revenueImportBatches.id, id), eq(revenueImportBatches.status, 'uploaded')))
        .returning({ id: revenueImportBatches.id })
      if (!rows[0]) throw new EditorError('conflict', 'Batch ini sudah di-commit atau dibuang')
    },
  }
}

export type RevenueRepository = ReturnType<typeof createRevenueRepository>

/**
 * Pengaturan dashboard dari env: REVENUE_BASE_CURRENCY (kode ISO 3 huruf,
 * bawaan IDR) dan REVENUE_TIMEZONE (IANA, bawaan Asia/Jakarta). Nilai salah
 * menggagalkan start, bukan diam-diam memakai bawaan.
 */
export function revenueSettingsFromEnv(env: Record<string, string | undefined>): RevenueSettings {
  const baseCurrency = env['REVENUE_BASE_CURRENCY']?.trim() || DEFAULT_REVENUE_SETTINGS.baseCurrency
  const timeZone = env['REVENUE_TIMEZONE']?.trim() || DEFAULT_REVENUE_SETTINGS.timeZone
  if (!/^[A-Z]{3}$/.test(baseCurrency)) throw new Error(`REVENUE_BASE_CURRENCY tidak valid: ${baseCurrency}`)
  try {
    new Intl.DateTimeFormat('en', { timeZone })
  } catch {
    throw new Error(`REVENUE_TIMEZONE tidak dikenal: ${timeZone}`)
  }
  return { baseCurrency, timeZone }
}
