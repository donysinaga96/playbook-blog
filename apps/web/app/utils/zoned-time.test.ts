import { describe, expect, it } from 'vitest'
import { isoToZonedInput, zonedInputToIso, zoneLabel } from './zoned-time'

describe('tanggal di zona waktu site', () => {
  it('Asia/Jakarta (UTC+7): input lokal <-> UTC', () => {
    expect(zonedInputToIso('2026-11-22T07:30', 'Asia/Jakarta')).toBe('2026-11-22T00:30:00.000Z')
    expect(isoToZonedInput('2026-11-22T00:30:00.000Z', 'Asia/Jakarta')).toBe('2026-11-22T07:30')
  })

  it('melewati pergantian hari', () => {
    expect(zonedInputToIso('2026-11-22T03:00', 'Asia/Jayapura')).toBe('2026-11-21T18:00:00.000Z')
  })

  it('zona dengan DST (Eropa) tetap tepat di kedua musim', () => {
    expect(zonedInputToIso('2026-07-01T12:00', 'Europe/Amsterdam')).toBe('2026-07-01T10:00:00.000Z')
    expect(zonedInputToIso('2026-12-01T12:00', 'Europe/Amsterdam')).toBe('2026-12-01T11:00:00.000Z')
  })

  it('kosong atau tidak valid', () => {
    expect(isoToZonedInput(null, 'Asia/Jakarta')).toBe('')
    expect(zonedInputToIso('', 'Asia/Jakarta')).toBeNull()
    expect(zonedInputToIso('22/11/2026', 'Asia/Jakarta')).toBeNull()
  })

  it('label zona', () => {
    expect(zoneLabel('Asia/Jakarta')).toBe('WIB')
  })
})
