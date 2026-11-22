// Aturan idempotensi dan revisi ledger (ADR-011), murni tanpa database agar
// bisa diuji langsung. Repository memanggil decideUpsert untuk setiap baris
// yang kuncinya sudah ada.
//
//   kunci baru                          -> insert
//   existing adjusted/refunded, masuk
//   status lain                         -> skip   (koreksi tidak ditimpa data biasa)
//   existing finalized, masuk estimated -> skip   (angka final tidak turun lagi)
//   isi sama (angka, mata uang, status,
//   metrik, dimensi, properti)          -> unchanged (webhook terkirim ulang, impor ulang)
//   selain itu                          -> update (trigger DB menyimpan versi lama)
import { addDays } from './dates'
import { compareDecimal, multiply } from './decimal'
import type { LedgerInput, LedgerStatus } from './types'

export interface ExistingEntry {
  status: LedgerStatus
  grossAmount: string
  currency: string
  metrics: Record<string, unknown>
  dimensions: Record<string, unknown>
  propertyId: string | null
}

export type UpsertDecision =
  | { action: 'insert' }
  | { action: 'update' }
  | { action: 'unchanged' }
  | { action: 'skip'; reason: string }

export function decideUpsert(existing: ExistingEntry | null, incoming: LedgerInput, incomingPropertyId: string | null): UpsertDecision {
  if (!existing) return { action: 'insert' }
  // Koreksi/refund hanya dibandingkan dengan data berstatus sama (mis.
  // baris refund dari file yang diimpor ulang); data biasa tidak menimpanya.
  if ((existing.status === 'adjusted' || existing.status === 'refunded') && incoming.status !== existing.status) {
    return { action: 'skip', reason: 'entri koreksi/refund tidak ditimpa data berstatus lain' }
  }
  if (existing.status === 'finalized' && incoming.status === 'estimated') {
    return { action: 'skip', reason: 'angka sudah final; data sementara diabaikan' }
  }
  const same =
    compareDecimal(existing.grossAmount, incoming.grossAmount) === 0 &&
    existing.currency === incoming.currency &&
    existing.status === incoming.status &&
    sameRecord(existing.metrics, incoming.metrics ?? {}) &&
    sameRecord(existing.dimensions, incoming.dimensions ?? {}) &&
    existing.propertyId === incomingPropertyId
  return same ? { action: 'unchanged' } : { action: 'update' }
}

/** Perbandingan object datar (metrik/dimensi); angka dibandingkan sebagai nilai. */
function sameRecord(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    const x = a[key]
    const y = b[key]
    if (typeof x === 'number' && typeof y === 'number') {
      if (Math.abs(x - y) > 1e-9) return false
    } else if (x !== y) {
      return false
    }
  }
  return true
}

/**
 * Konversi ke mata uang utama: round(gross x rate, 2). Mata uang sama ->
 * kurs 1. Kurs null (belum ada) -> keduanya null; entri tetap tersimpan
 * dan tampil sebagai "belum dikonversi".
 */
export function normalizeAmount(grossAmount: string, currency: string, baseCurrency: string, rate: string | null): { fxRate: string | null; normalized: string | null } {
  if (currency === baseCurrency) return { fxRate: '1', normalized: multiply(grossAmount, '1', 2) }
  if (rate === null) return { fxRate: null, normalized: null }
  return { fxRate: rate, normalized: multiply(grossAmount, rate, 2) }
}

/** Domain dari laporan/URL -> bentuk revenue_properties.domain (huruf kecil, tanpa skema, port, www.). */
export function normalizeDomain(value: string | null | undefined): string | null {
  if (!value) return null
  let text = value.trim().toLowerCase()
  if (!text || text === '-') return null
  text = text.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split('/')[0]?.split(':')[0] ?? ''
  text = text.replace(/^www\./, '').replace(/\.$/, '')
  return /^[a-z0-9.-]+$/.test(text) && text.includes('.') ? text : null
}

/** Status final per jendela lookback: tanggal lebih tua dari `lookbackDays` hari = final. */
export function statusByLookback(reportDate: string, today: string, lookbackDays: number): LedgerStatus {
  return reportDate < addDays(today, -lookbackDays) ? 'finalized' : 'estimated'
}
