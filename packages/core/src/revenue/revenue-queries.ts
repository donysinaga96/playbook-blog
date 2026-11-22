// Query baca dashboard pendapatan (ADR-011). Semua angka uang dikembalikan
// sebagai teks desimal (numeric PostgreSQL) agar tidak kehilangan presisi;
// browser yang memformat. Jumlah selalu memakai normalized_amount (mata
// uang utama); entri tanpa kurs dihitung terpisah sebagai peringatan.
import { sql, type SQL } from '@framework/db'
import { notFound } from '../editor/errors'
import type { RepositoryContext } from '../repositories/types'
import { normalizePaging, toPage, type Page, type PageQuery } from '../repositories/types'
import { addDays, dateInZone, daysBetween, isIsoDate, startOfMonth } from './dates'
import { queryRows, type RevenueSettings } from './revenue-repository'
import { LEDGER_STATUSES, type LedgerStatus } from './types'

export type Granularity = 'day' | 'week' | 'month'

export interface RevenueFilters {
  from: string
  to: string
  /** Kode sumber; kosong = semua. */
  sources?: string[]
  statuses?: LedgerStatus[]
  /** id properti, atau 'none' untuk entri yang belum dipetakan ke situs. */
  propertyId?: string | null
}

export interface SeriesPoint {
  bucket: string
  sourceCode: string
  amount: string
}

export interface SourceTotal {
  code: string
  name: string
  amount: string
  previousAmount: string
  entries: number
}

export interface PropertyTotal {
  propertyId: string | null
  code: string | null
  name: string
  domain: string | null
  amount: string
  previousAmount: string
  entries: number
}

export interface RecentEntry {
  id: string
  sourceCode: string
  sourceName: string
  channelType: string
  reportDate: string
  occurredAt: string | null
  grossAmount: string
  currency: string
  normalizedAmount: string | null
  status: LedgerStatus
  description: string | null
  propertyName: string | null
  revision: number
  updatedAt: string
}

export interface SourceHealth {
  code: string
  name: string
  connector: string
  integrationType: string
  isActive: boolean
  syncIntervalMinutes: number | null
  lastSyncAt: string | null
  lastSyncStatus: string | null
  lastRun: { id: string; status: string; startedAt: string; finishedAt: string | null; errorMessage: string | null; mock: boolean } | null
  lastWebhook: { status: string; receivedAt: string; error: string | null } | null
  webhookFailures24h: number
  lastImport: { status: string; createdAt: string; fileName: string } | null
}

export interface RevenueOverview {
  range: { from: string; to: string; previousFrom: string; previousTo: string; today: string }
  baseCurrency: string
  total: string
  previousTotal: string
  entries: number
  today: string
  yesterday: string
  monthToDate: string
  previousMonthToDate: string
  byStatus: { status: LedgerStatus; amount: string; entries: number }[]
  bySource: SourceTotal[]
  byProperty: PropertyTotal[]
  series: SeriesPoint[]
  unconverted: { currency: string; entries: number; grossAmount: string }[]
}

function cleanFilters(filters: RevenueFilters): RevenueFilters {
  if (!isIsoDate(filters.from) || !isIsoDate(filters.to) || filters.from > filters.to) throw new Error('rentang tanggal tidak valid')
  if (daysBetween(filters.from, filters.to) > 3 * 366) throw new Error('rentang maksimum 3 tahun')
  return {
    ...filters,
    sources: filters.sources?.filter((s) => /^[a-z0-9_]{1,40}$/.test(s)),
    statuses: filters.statuses?.filter((s) => (LEDGER_STATUSES as readonly string[]).includes(s)),
  }
}

/** WHERE untuk filter sumber/status/properti (tanpa rentang tanggal). */
function scope(filters: RevenueFilters): SQL {
  const parts: SQL[] = [sql`true`]
  if (filters.sources?.length) parts.push(sql`s.code IN (${sql.join(filters.sources.map((c) => sql`${c}`), sql`, `)})`)
  if (filters.statuses?.length) parts.push(sql`e.status IN (${sql.join(filters.statuses.map((c) => sql`${c}`), sql`, `)})`)
  if (filters.propertyId === 'none') parts.push(sql`e.property_id IS NULL`)
  else if (filters.propertyId) parts.push(sql`e.property_id = ${filters.propertyId}::uuid`)
  return sql.join(parts, sql` AND `)
}

const between = (from: string, to: string) => sql`e.report_date BETWEEN ${from}::date AND ${to}::date`

export function createRevenueQueries(ctx: RepositoryContext, settings: RevenueSettings) {
  const { db } = ctx
  const today = () => dateInZone(ctx.now(), settings.timeZone)

  async function sumIn(filters: RevenueFilters, from: string, to: string): Promise<{ amount: string; entries: number }> {
    const [row] = await queryRows<{ amount: string; entries: number }>(db, sql`
      SELECT coalesce(sum(e.normalized_amount), 0)::text AS amount, count(*)::int AS entries
        FROM revenue_ledger_entries e JOIN revenue_sources s ON s.id = e.source_id
       WHERE ${between(from, to)} AND ${scope(filters)}`)
    return row ?? { amount: '0', entries: 0 }
  }

  return {
    today,

    async overview(rawFilters: RevenueFilters, granularity: Granularity): Promise<RevenueOverview> {
      const filters = cleanFilters(rawFilters)
      const length = daysBetween(filters.from, filters.to) + 1
      const previousTo = addDays(filters.from, -1)
      const previousFrom = addDays(previousTo, -(length - 1))
      const t = today()
      const monthStart = startOfMonth(t)
      const dayOfMonth = daysBetween(monthStart, t)
      const prevMonthStart = startOfMonth(addDays(monthStart, -1))
      // Bulan lalu sampai tanggal yang sama (dibatasi akhir bulan lalu).
      const prevMonthSameDay = [addDays(prevMonthStart, dayOfMonth), addDays(monthStart, -1)].sort()[0] as string

      const [current, previous, todayRow, yesterdayRow, mtd, prevMtd] = await Promise.all([
        sumIn(filters, filters.from, filters.to),
        sumIn(filters, previousFrom, previousTo),
        sumIn(filters, t, t),
        sumIn(filters, addDays(t, -1), addDays(t, -1)),
        sumIn(filters, monthStart, t),
        sumIn(filters, prevMonthStart, prevMonthSameDay),
      ])

      const trunc = granularity === 'day' ? sql`e.report_date` : sql`date_trunc(${granularity}, e.report_date)::date`
      const [series, bySource, byProperty, byStatus, unconverted] = await Promise.all([
        queryRows<SeriesPoint>(db, sql`
          SELECT to_char(${trunc}, 'YYYY-MM-DD') AS bucket, s.code AS "sourceCode", coalesce(sum(e.normalized_amount), 0)::text AS amount
            FROM revenue_ledger_entries e JOIN revenue_sources s ON s.id = e.source_id
           WHERE ${between(filters.from, filters.to)} AND ${scope(filters)}
           GROUP BY 1, 2 ORDER BY 1, 2`),
        queryRows<SourceTotal>(db, sql`
          SELECT s.code, s.name,
                 coalesce(sum(e.normalized_amount) FILTER (WHERE e.report_date BETWEEN ${filters.from}::date AND ${filters.to}::date), 0)::text AS amount,
                 coalesce(sum(e.normalized_amount) FILTER (WHERE e.report_date BETWEEN ${previousFrom}::date AND ${previousTo}::date), 0)::text AS "previousAmount",
                 count(e.id) FILTER (WHERE e.report_date BETWEEN ${filters.from}::date AND ${filters.to}::date)::int AS entries
            FROM revenue_sources s
            LEFT JOIN revenue_ledger_entries e ON e.source_id = s.id AND ${between(previousFrom, filters.to)} AND ${scope(filters)}
           WHERE ${filters.sources?.length ? sql`s.code IN (${sql.join(filters.sources.map((c) => sql`${c}`), sql`, `)})` : sql`true`}
           GROUP BY s.id, s.code, s.name, s.sort_order
           ORDER BY s.sort_order, s.name`),
        queryRows<PropertyTotal>(db, sql`
          SELECT p.id AS "propertyId", p.code, coalesce(p.name, 'Belum dipetakan') AS name, p.domain,
                 coalesce(sum(e.normalized_amount) FILTER (WHERE e.report_date BETWEEN ${filters.from}::date AND ${filters.to}::date), 0)::text AS amount,
                 coalesce(sum(e.normalized_amount) FILTER (WHERE e.report_date BETWEEN ${previousFrom}::date AND ${previousTo}::date), 0)::text AS "previousAmount",
                 count(e.id) FILTER (WHERE e.report_date BETWEEN ${filters.from}::date AND ${filters.to}::date)::int AS entries
            FROM revenue_ledger_entries e
            JOIN revenue_sources s ON s.id = e.source_id
            LEFT JOIN revenue_properties p ON p.id = e.property_id
           WHERE ${between(previousFrom, filters.to)} AND ${scope(filters)}
           GROUP BY p.id, p.code, p.name, p.domain
           ORDER BY sum(e.normalized_amount) FILTER (WHERE e.report_date BETWEEN ${filters.from}::date AND ${filters.to}::date) DESC NULLS LAST`),
        queryRows<{ status: LedgerStatus; amount: string; entries: number }>(db, sql`
          SELECT e.status, coalesce(sum(e.normalized_amount), 0)::text AS amount, count(*)::int AS entries
            FROM revenue_ledger_entries e JOIN revenue_sources s ON s.id = e.source_id
           WHERE ${between(filters.from, filters.to)} AND ${scope(filters)}
           GROUP BY e.status`),
        queryRows<{ currency: string; entries: number; grossAmount: string }>(db, sql`
          SELECT e.currency, count(*)::int AS entries, sum(e.gross_amount)::text AS "grossAmount"
            FROM revenue_ledger_entries e JOIN revenue_sources s ON s.id = e.source_id
           WHERE e.normalized_amount IS NULL AND ${between(filters.from, filters.to)} AND ${scope(filters)}
           GROUP BY e.currency ORDER BY e.currency`),
      ])

      return {
        range: { from: filters.from, to: filters.to, previousFrom, previousTo, today: t },
        baseCurrency: settings.baseCurrency,
        total: current.amount,
        previousTotal: previous.amount,
        entries: current.entries,
        today: todayRow.amount,
        yesterday: yesterdayRow.amount,
        monthToDate: mtd.amount,
        previousMonthToDate: prevMtd.amount,
        byStatus,
        bySource,
        byProperty,
        series,
        unconverted,
      }
    },

    /** Entri terbaru (berdasarkan waktu masuk/diubah), untuk "Aktivitas terbaru". */
    async recent(filters: Pick<RevenueFilters, 'sources' | 'propertyId'>, limit = 12): Promise<RecentEntry[]> {
      const f = { from: '2000-01-01', to: '2999-12-31', ...filters }
      return queryRows<RecentEntry>(db, sql`
        SELECT e.id, s.code AS "sourceCode", s.name AS "sourceName", e.channel_type AS "channelType",
               to_char(e.report_date, 'YYYY-MM-DD') AS "reportDate", e.occurred_at AS "occurredAt",
               e.gross_amount::text AS "grossAmount", e.currency, e.normalized_amount::text AS "normalizedAmount",
               e.status, e.description, p.name AS "propertyName", e.revision, e.updated_at AS "updatedAt"
          FROM revenue_ledger_entries e
          JOIN revenue_sources s ON s.id = e.source_id
          LEFT JOIN revenue_properties p ON p.id = e.property_id
         WHERE ${scope(f)}
         ORDER BY e.updated_at DESC, e.id DESC
         LIMIT ${Math.min(Math.max(limit, 1), 50)}`)
    },

    /** Status konektor per sumber: run terakhir, webhook terakhir, impor terakhir. */
    async health(): Promise<SourceHealth[]> {
      return queryRows<SourceHealth>(db, sql`
        SELECT s.code, s.name, s.connector, s.integration_type AS "integrationType", s.is_active AS "isActive",
               s.sync_interval_minutes AS "syncIntervalMinutes", s.last_sync_at AS "lastSyncAt", s.last_sync_status AS "lastSyncStatus",
               (SELECT json_build_object('id', r.id, 'status', r.status, 'startedAt', r.started_at, 'finishedAt', r.finished_at, 'errorMessage', r.error_message, 'mock', r.mock)
                  FROM revenue_sync_runs r WHERE r.source_id = s.id ORDER BY r.started_at DESC LIMIT 1) AS "lastRun",
               (SELECT json_build_object('status', w.status, 'receivedAt', w.received_at, 'error', w.error)
                  FROM revenue_webhook_events w WHERE w.source_id = s.id ORDER BY w.received_at DESC LIMIT 1) AS "lastWebhook",
               (SELECT count(*)::int FROM revenue_webhook_events w
                 WHERE w.source_id = s.id AND w.status IN ('rejected', 'failed') AND w.received_at > now() - interval '24 hours') AS "webhookFailures24h",
               (SELECT json_build_object('status', b.status, 'createdAt', b.created_at, 'fileName', b.file_name)
                  FROM revenue_import_batches b WHERE b.source_id = s.id ORDER BY b.created_at DESC LIMIT 1) AS "lastImport"
          FROM revenue_sources s
         ORDER BY s.sort_order, s.name`)
    },

    /** Daftar entri ledger dengan filter + pencarian teks, terbaru dulu. */
    async listEntries(rawFilters: RevenueFilters & { q?: string; channel?: string }, paging: PageQuery = {}): Promise<Page<RecentEntry & { externalId: string | null; dimensions: Record<string, string>; metrics: Record<string, number> }>> {
      const filters = cleanFilters(rawFilters)
      const { page, pageSize, offset } = normalizePaging(paging)
      const extra: SQL[] = []
      const q = rawFilters.q?.trim().slice(0, 100)
      if (q) {
        const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
        extra.push(sql`(e.description ILIKE ${like} OR e.external_id ILIKE ${like} OR e.idempotency_key ILIKE ${like} OR e.dimensions::text ILIKE ${like})`)
      }
      if (rawFilters.channel && /^[a-z_]{1,20}$/.test(rawFilters.channel)) extra.push(sql`e.channel_type = ${rawFilters.channel}`)
      const where = sql`${between(filters.from, filters.to)} AND ${scope(filters)}${extra.length ? sql` AND ${sql.join(extra, sql` AND `)}` : sql``}`
      const [count] = await queryRows<{ n: number }>(db, sql`
        SELECT count(*)::int AS n FROM revenue_ledger_entries e JOIN revenue_sources s ON s.id = e.source_id WHERE ${where}`)
      const items = await queryRows<RecentEntry & { externalId: string | null; dimensions: Record<string, string>; metrics: Record<string, number> }>(db, sql`
        SELECT e.id, s.code AS "sourceCode", s.name AS "sourceName", e.channel_type AS "channelType",
               to_char(e.report_date, 'YYYY-MM-DD') AS "reportDate", e.occurred_at AS "occurredAt",
               e.gross_amount::text AS "grossAmount", e.currency, e.normalized_amount::text AS "normalizedAmount",
               e.status, e.description, p.name AS "propertyName", e.revision, e.updated_at AS "updatedAt",
               e.external_id AS "externalId", e.dimensions, e.metrics_json AS metrics
          FROM revenue_ledger_entries e
          JOIN revenue_sources s ON s.id = e.source_id
          LEFT JOIN revenue_properties p ON p.id = e.property_id
         WHERE ${where}
         ORDER BY e.report_date DESC, e.updated_at DESC, e.id DESC
         LIMIT ${pageSize} OFFSET ${offset}`)
      return toPage(items, count?.n ?? 0, page, pageSize)
    },

    /** Satu entri + revisi + entri yang mengoreksinya (refund/adjustment). */
    async getEntry(id: string) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('Entri')
      const [entry] = await queryRows<Record<string, unknown>>(db, sql`
        SELECT e.id, s.code AS "sourceCode", s.name AS "sourceName", e.channel_type AS "channelType", e.idempotency_key AS "idempotencyKey",
               e.external_id AS "externalId", to_char(e.report_date, 'YYYY-MM-DD') AS "reportDate", e.occurred_at AS "occurredAt",
               e.gross_amount::text AS "grossAmount", e.currency, e.fx_rate_to_base::text AS "fxRateToBase", e.base_currency AS "baseCurrency",
               e.normalized_amount::text AS "normalizedAmount", e.status, e.metrics_json AS metrics, e.dimensions, e.description, e.note,
               e.raw_payload AS "rawPayload", e.adjusts_entry_id AS "adjustsEntryId", e.sync_run_id AS "syncRunId",
               e.import_batch_id AS "importBatchId", e.webhook_event_id AS "webhookEventId", u.display_name AS "createdByName",
               e.revision, e.created_at AS "createdAt", e.updated_at AS "updatedAt", p.id AS "propertyId", p.name AS "propertyName"
          FROM revenue_ledger_entries e
          JOIN revenue_sources s ON s.id = e.source_id
          LEFT JOIN revenue_properties p ON p.id = e.property_id
          LEFT JOIN users u ON u.id = e.created_by
         WHERE e.id = ${id}::uuid`)
      if (!entry) throw notFound('Entri')
      const [revisions, corrections] = await Promise.all([
        queryRows(db, sql`
          SELECT revision, gross_amount::text AS "grossAmount", currency, fx_rate_to_base::text AS "fxRateToBase",
                 normalized_amount::text AS "normalizedAmount", status, metrics_json AS metrics, replaced_at AS "replacedAt"
            FROM revenue_ledger_revisions WHERE entry_id = ${id}::uuid ORDER BY revision DESC`),
        queryRows(db, sql`
          SELECT id, status, gross_amount::text AS "grossAmount", currency, normalized_amount::text AS "normalizedAmount",
                 note, to_char(report_date, 'YYYY-MM-DD') AS "reportDate", created_at AS "createdAt"
            FROM revenue_ledger_entries WHERE adjusts_entry_id = ${id}::uuid ORDER BY created_at`),
      ])
      return { entry, revisions, corrections }
    },

    /**
     * Ringkasan per sumber: total, jumlah metrik (impressions, clicks, orders,
     * ...), tren harian, dan breakdown dimensi (domain, placement, product, ...).
     */
    async sourceDetail(code: string, rawFilters: Omit<RevenueFilters, 'sources'>) {
      const filters = cleanFilters({ ...rawFilters, sources: [code] })
      const [source] = await queryRows<{ id: string; code: string }>(db, sql`SELECT id, code FROM revenue_sources WHERE code = ${code}`)
      if (!source) throw notFound('Sumber pendapatan')
      const length = daysBetween(filters.from, filters.to) + 1
      const previousTo = addDays(filters.from, -1)
      const previousFrom = addDays(previousTo, -(length - 1))
      const [current, previous, metrics, daily, dimensionKeys] = await Promise.all([
        queryRows<{ amount: string; gross: string | null; currencies: string[]; entries: number }>(db, sql`
          SELECT coalesce(sum(e.normalized_amount), 0)::text AS amount, count(*)::int AS entries,
                 CASE WHEN count(DISTINCT e.currency) = 1 THEN sum(e.gross_amount)::text END AS gross,
                 coalesce(array_agg(DISTINCT e.currency) FILTER (WHERE e.currency IS NOT NULL), '{}') AS currencies
            FROM revenue_ledger_entries e JOIN revenue_sources s ON s.id = e.source_id
           WHERE ${between(filters.from, filters.to)} AND ${scope(filters)}`),
        sumIn(filters, previousFrom, previousTo),
        queryRows<{ key: string; total: string }>(db, sql`
          SELECT m.key, sum(m.value::numeric)::text AS total
            FROM revenue_ledger_entries e JOIN revenue_sources s ON s.id = e.source_id,
                 LATERAL jsonb_each_text(e.metrics_json) m
           WHERE ${between(filters.from, filters.to)} AND ${scope(filters)} AND m.value ~ '^-?[0-9]+(\\.[0-9]+)?([eE][-+]?[0-9]+)?$'
           GROUP BY m.key`),
        queryRows<{ date: string; amount: string; gross: string; status: string; entries: number }>(db, sql`
          SELECT to_char(e.report_date, 'YYYY-MM-DD') AS date, coalesce(sum(e.normalized_amount), 0)::text AS amount,
                 sum(e.gross_amount)::text AS gross, min(e.status) AS status, count(*)::int AS entries
            FROM revenue_ledger_entries e JOIN revenue_sources s ON s.id = e.source_id
           WHERE ${between(filters.from, filters.to)} AND ${scope(filters)}
           GROUP BY e.report_date ORDER BY e.report_date`),
        queryRows<{ key: string }>(db, sql`
          SELECT DISTINCT d.key
            FROM revenue_ledger_entries e JOIN revenue_sources s ON s.id = e.source_id,
                 LATERAL jsonb_object_keys(e.dimensions) d(key)
           WHERE ${between(filters.from, filters.to)} AND ${scope(filters)} AND d.key NOT IN ('domain_id')
           LIMIT 8`),
      ])
      const breakdowns = await Promise.all(dimensionKeys.map(async ({ key }) => ({
        key,
        rows: await queryRows<{ value: string; amount: string; gross: string; entries: number; metrics: Record<string, number> }>(db, sql`
          WITH base AS (
            SELECT coalesce(e.dimensions->>${key}, '-') AS value, e.normalized_amount, e.gross_amount, e.metrics_json
              FROM revenue_ledger_entries e JOIN revenue_sources s ON s.id = e.source_id
             WHERE ${between(filters.from, filters.to)} AND ${scope(filters)}
          )
          SELECT b.value, coalesce(sum(b.normalized_amount), 0)::text AS amount, sum(b.gross_amount)::text AS gross, count(*)::int AS entries,
                 coalesce((SELECT jsonb_object_agg(agg.k, agg.v) FROM (
                    SELECT m.key AS k, sum(m.value::numeric) AS v
                      FROM base b2, LATERAL jsonb_each_text(b2.metrics_json) m
                     WHERE b2.value = b.value AND m.key IN ('impressions', 'clicks', 'pageViews', 'orders', 'items')
                       AND m.value ~ '^-?[0-9]+(\\.[0-9]+)?$'
                     GROUP BY m.key) agg), '{}'::jsonb) AS metrics
            FROM base b
           GROUP BY b.value
           ORDER BY sum(b.normalized_amount) DESC NULLS LAST
           LIMIT 25`),
      })))
      const runs = await queryRows(db, sql`
        SELECT id, channel_type AS "channelType", trigger, status, mock, to_char(range_start, 'YYYY-MM-DD') AS "rangeStart",
               to_char(range_end, 'YYYY-MM-DD') AS "rangeEnd", started_at AS "startedAt", finished_at AS "finishedAt",
               rows_fetched AS "rowsFetched", inserted, updated, unchanged, skipped, failed, error_message AS "errorMessage", log
          FROM revenue_sync_runs WHERE source_id = ${source.id}::uuid ORDER BY started_at DESC LIMIT 20`)
      const webhooks = await queryRows(db, sql`
        SELECT id, received_at AS "receivedAt", event_type AS "eventType", external_event_id AS "externalEventId",
               signature_valid AS "signatureValid", status, error, test, ledger_entry_id AS "ledgerEntryId"
          FROM revenue_webhook_events WHERE source_id = ${source.id}::uuid ORDER BY received_at DESC LIMIT 30`)
      const imports = await queryRows(db, sql`
        SELECT id, file_name AS "fileName", file_format AS "fileFormat", status, row_count AS "rowCount",
               inserted, updated, unchanged, skipped, failed, created_at AS "createdAt", committed_at AS "committedAt"
          FROM revenue_import_batches WHERE source_id = ${source.id}::uuid ORDER BY created_at DESC LIMIT 20`)
      return {
        range: { from: filters.from, to: filters.to, previousFrom, previousTo },
        baseCurrency: settings.baseCurrency,
        total: current[0]?.amount ?? '0',
        gross: current[0]?.gross ?? null,
        currencies: current[0]?.currencies ?? [],
        entries: current[0]?.entries ?? 0,
        previousTotal: previous.amount,
        metrics: Object.fromEntries(metrics.map((m) => [m.key, m.total])),
        daily,
        breakdowns,
        runs,
        webhooks,
        imports,
      }
    },

    async listRuns(limit = 30) {
      return queryRows(db, sql`
        SELECT r.id, s.code AS "sourceCode", s.name AS "sourceName", r.channel_type AS "channelType", r.trigger, r.status, r.mock,
               to_char(r.range_start, 'YYYY-MM-DD') AS "rangeStart", to_char(r.range_end, 'YYYY-MM-DD') AS "rangeEnd",
               r.started_at AS "startedAt", r.finished_at AS "finishedAt", r.rows_fetched AS "rowsFetched",
               r.inserted, r.updated, r.unchanged, r.skipped, r.failed, r.error_message AS "errorMessage", r.log
          FROM revenue_sync_runs r JOIN revenue_sources s ON s.id = r.source_id
         ORDER BY r.started_at DESC LIMIT ${Math.min(Math.max(limit, 1), 100)}`)
    },

    async listImports(limit = 30) {
      return queryRows(db, sql`
        SELECT b.id, s.code AS "sourceCode", s.name AS "sourceName", b.file_name AS "fileName", b.file_format AS "fileFormat",
               b.status, b.row_count AS "rowCount", b.inserted, b.updated, b.unchanged, b.skipped, b.failed,
               b.created_at AS "createdAt", b.committed_at AS "committedAt", u.display_name AS "createdByName"
          FROM revenue_import_batches b JOIN revenue_sources s ON s.id = b.source_id LEFT JOIN users u ON u.id = b.created_by
         ORDER BY b.created_at DESC LIMIT ${Math.min(Math.max(limit, 1), 100)}`)
    },
  }
}

export type RevenueQueries = ReturnType<typeof createRevenueQueries>
