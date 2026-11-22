// Tanggal laporan pendapatan: 'YYYY-MM-DD' tanpa jam (kolom date). "Hari
// ini" selalu dihitung di zona waktu dashboard (REVENUE_TIMEZONE), bukan
// zona waktu server.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.toISOString().slice(0, 10) === value
}

/** Tanggal kalender (YYYY-MM-DD) dari sebuah saat, di zona waktu tertentu. */
export function dateInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant)
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Jumlah hari dari a ke b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`
}

export function addMonths(date: string, months: number): string {
  const [y, m] = date.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 10)
}

/** Indeks bulan absolut (tahun x 12 + bulan), untuk membandingkan bulan. */
export function monthIndex(date: string): number {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1
}

/** Semua tanggal dari `from` sampai `to` (inklusif). */
export function eachDate(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000
}

/**
 * Waktu lokal tanpa zona ('2025-04-10T14:30:45', seperti createdAt Lynk.id)
 * di zona `timeZone` -> Date (UTC). Teks yang sudah membawa zona (Z atau
 * +07:00) dipakai apa adanya. Null bila tidak bisa dibaca.
 */
export function zonedLocalToDate(local: string, timeZone: string): Date | null {
  const text = local.trim()
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(text)) {
    const d = new Date(text)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(text)
  if (!m) return null
  const asUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0))
  let guess = asUtc - offsetMs(new Date(asUtc), timeZone)
  guess = asUtc - offsetMs(new Date(guess), timeZone)
  return new Date(guess)
}
