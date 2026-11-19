// Tanggal untuk view model: selalu dengan locale dan zona waktu SITE, bukan
// zona waktu server. Server di UTC tetap menampilkan "19 November 2026"
// untuk artikel yang terbit pukul 01.00 WIB tanggal 19.
import type { DateView } from '@framework/template-kit'

export interface DateFormatter {
  /** Tanggal artikel, mis. "17 November 2026". */
  date(value: Date): DateView
  /** Hari ini lengkap dengan nama hari, untuk header; iso berupa YYYY-MM-DD. */
  today(now: Date): DateView
}

export function createDateFormatter(locale: string, timeZone: string): DateFormatter {
  const long = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone })
  const full = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone })
  // en-CA menulis tanggal sebagai YYYY-MM-DD.
  const isoDay = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone })
  return {
    date: (value) => ({ iso: value.toISOString(), label: long.format(value) }),
    today: (now) => ({ iso: isoDay.format(now), label: full.format(now) }),
  }
}

/** Tanggal kalender (YYYY-MM-DD) di zona waktu tertentu. */
export function calendarDay(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(value)
}
