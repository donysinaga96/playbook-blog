import { describe, expect, it } from 'vitest'
import { compareDecimal, DecimalError, fromScaled, multiply, negate, parseAmountText, sum, toDecimal, toScaled } from './decimal'
import { decideUpsert, normalizeAmount, normalizeDomain, statusByLookback, type ExistingEntry } from './ledger-rules'
import type { LedgerInput } from './types'

describe('desimal uang tanpa float', () => {
  it('toDecimal: bentuk kanonik dari angka JSON dan teks', () => {
    expect(toDecimal(1.154)).toBe('1.154')
    expect(toDecimal(72000)).toBe('72000')
    expect(toDecimal(2e-7)).toBe('0.0000002')
    expect(toDecimal('007.500')).toBe('7.5')
    expect(toDecimal('-0.00')).toBe('0')
    expect(() => toDecimal('1,5')).toThrow(DecimalError)
    expect(() => toDecimal(Number.NaN)).toThrow(DecimalError)
  })

  it('toScaled/fromScaled membulatkan half away from zero', () => {
    expect(toScaled('1.005', 2)).toBe(101n)
    expect(toScaled('-1.005', 2)).toBe(-101n)
    expect(fromScaled(-5n, 2)).toBe('-0.05')
    expect(fromScaled(0n, 2)).toBe('0.00')
  })

  it('multiply tepat untuk kurs (0.1 x 3 bukan 0.30000000000000004)', () => {
    expect(multiply('0.1', '3', 2)).toBe('0.30')
    expect(multiply('1.154', '16250.5', 2)).toBe('18753.08') // 18753.077
    expect(multiply('-12.345', '1', 2)).toBe('-12.35')
    expect(multiply('0.005', '1', 2)).toBe('0.01')
  })

  it('sum, compare, negate', () => {
    expect(sum(['0.1', '0.2', '-0.05'], 2)).toBe('0.25')
    expect(compareDecimal('1.50', '1.5')).toBe(0)
    expect(compareDecimal('-1', '0')).toBe(-1)
    expect(negate('12.5')).toBe('-12.5')
    expect(negate('-3')).toBe('3')
    expect(negate('0')).toBe('0')
  })

  it('parseAmountText: format Indonesia dan internasional, simbol, kurung akuntansi', () => {
    expect(parseAmountText('Rp 1.234.567,89', ',')).toBe('1234567.89')
    expect(parseAmountText('$1,234.50', '.')).toBe('1234.5')
    expect(parseAmountText('(12.50)', '.')).toBe('-12.5')
    expect(parseAmountText('-72000', ',')).toBe('-72000')
    expect(parseAmountText('1.234', ',')).toBe('1234')
    // Pemisah salah pilih ditolak, bukan diam-diam meleset 100x.
    expect(() => parseAmountText('12.50', ',')).toThrow(/ambigu/)
    expect(() => parseAmountText('12,50', '.')).toThrow(/ambigu/)
    expect(() => parseAmountText('abc', '.')).toThrow(DecimalError)
  })
})

describe('normalisasi mata uang', () => {
  it('mata uang utama -> kurs 1', () => {
    expect(normalizeAmount('72000', 'IDR', 'IDR', null)).toEqual({ fxRate: '1', normalized: '72000.00' })
  })
  it('mata uang asing dengan kurs', () => {
    expect(normalizeAmount('26.043', 'USD', 'IDR', '16250')).toEqual({ fxRate: '16250', normalized: '423198.75' })
  })
  it('kurs belum ada -> kosong (tampil sebagai belum dikonversi)', () => {
    expect(normalizeAmount('10', 'USD', 'IDR', null)).toEqual({ fxRate: null, normalized: null })
  })
})

describe('aturan idempotensi & revisi', () => {
  const existing = (over: Partial<ExistingEntry> = {}): ExistingEntry => ({
    status: 'estimated', grossAmount: '1.154000', currency: 'USD', metrics: { impressions: 3014 }, dimensions: { domain: 'a.com' }, propertyId: null, ...over,
  })
  const incoming = (over: Partial<LedgerInput> = {}): LedgerInput => ({
    idempotencyKey: 'k', reportDate: '2026-11-01', grossAmount: '1.154', currency: 'USD', status: 'estimated', metrics: { impressions: 3014 }, dimensions: { domain: 'a.com' }, ...over,
  })

  it('kunci baru -> insert', () => {
    expect(decideUpsert(null, incoming(), null)).toEqual({ action: 'insert' })
  })
  it('isi sama (angka dibandingkan sebagai nilai) -> unchanged', () => {
    expect(decideUpsert(existing(), incoming(), null)).toEqual({ action: 'unchanged' })
  })
  it('angka direvisi -> update', () => {
    expect(decideUpsert(existing(), incoming({ grossAmount: '1.2' }), null).action).toBe('update')
    expect(decideUpsert(existing(), incoming({ metrics: { impressions: 3100 } }), null).action).toBe('update')
  })
  it('estimated -> finalized = update; finalized tidak turun ke estimated', () => {
    expect(decideUpsert(existing(), incoming({ status: 'finalized' }), null).action).toBe('update')
    expect(decideUpsert(existing({ status: 'finalized' }), incoming({ status: 'estimated', grossAmount: '9' }), null).action).toBe('skip')
  })
  it('entri koreksi/refund tidak ditimpa data berstatus lain; impor ulang refund yang sama = unchanged', () => {
    expect(decideUpsert(existing({ status: 'adjusted' }), incoming(), null).action).toBe('skip')
    expect(decideUpsert(existing({ status: 'refunded', grossAmount: '-29' }), incoming({ status: 'refunded', grossAmount: '-29' }), null).action).toBe('unchanged')
  })
  it('pemetaan situs berubah -> update', () => {
    expect(decideUpsert(existing(), incoming(), 'p1').action).toBe('update')
  })
  it('statusByLookback: lebih tua dari jendela = final', () => {
    expect(statusByLookback('2026-11-17', '2026-11-22', 3)).toBe('finalized')
    expect(statusByLookback('2026-11-19', '2026-11-22', 3)).toBe('estimated')
  })
  it('normalizeDomain', () => {
    expect(normalizeDomain('https://www.BeritaKonoha.id/berita?x=1')).toBe('beritakonoha.id')
    expect(normalizeDomain('cekbansos.info:443')).toBe('cekbansos.info')
    expect(normalizeDomain('-')).toBeNull()
    expect(normalizeDomain('localhost')).toBeNull()
  })
})
