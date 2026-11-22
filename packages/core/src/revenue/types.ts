// Tipe ledger pendapatan (ADR-011). Semua jalur (webhook, API, impor file,
// headless, manual) menghasilkan LedgerInput yang sama, lalu ditulis lewat
// satu fungsi upsert di repository.

export const CHANNEL_TYPES = ['webhook', 'api', 'csv_import', 'headless', 'manual'] as const
export type ChannelType = (typeof CHANNEL_TYPES)[number]

export const LEDGER_STATUSES = ['estimated', 'finalized', 'adjusted', 'refunded'] as const
export type LedgerStatus = (typeof LEDGER_STATUSES)[number]

export const CONNECTORS = ['lynk', 'adsterra', 'adsense', 'headless', 'generic'] as const
export type Connector = (typeof CONNECTORS)[number]

/** Metrik tambahan (iklan: impressions, clicks, cpm, ...; penjualan: orders, items). */
export type LedgerMetrics = Record<string, number>
/** Dimensi laporan (domain, placement, country, sub_id, product, ...). */
export type LedgerDimensions = Record<string, string>

export interface LedgerInput {
  /** Unik per sumber; menentukan insert vs update (idempotensi). */
  idempotencyKey: string
  externalId?: string | null
  occurredAt?: Date | null
  /** YYYY-MM-DD */
  reportDate: string
  /** Desimal kanonik di mata uang asli. */
  grossAmount: string
  currency: string
  status: LedgerStatus
  metrics?: LedgerMetrics
  dimensions?: LedgerDimensions
  description?: string | null
  note?: string | null
  rawPayload?: unknown
  /** Domain untuk memetakan ke revenue_properties (mis. dari laporan iklan). */
  propertyDomain?: string | null
  /** Properti eksplisit (input manual, mapping impor); menang atas propertyDomain. */
  propertyId?: string | null
  adjustsEntryId?: string | null
}

export type UpsertOutcome = 'inserted' | 'updated' | 'unchanged' | 'skipped'

export interface UpsertCounts {
  inserted: number
  updated: number
  unchanged: number
  skipped: number
  failed: number
}

export const emptyCounts = (): UpsertCounts => ({ inserted: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 })

export class RevenueError extends Error {
  override name = 'RevenueError'
}
