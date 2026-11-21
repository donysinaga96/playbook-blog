// Tanggal terbit di admin diisi dalam zona waktu SITE (bukan zona waktu
// browser), lalu disimpan sebagai UTC (ISO 8601). Input <input
// type="datetime-local"> memakai bentuk 'YYYY-MM-DDTHH:mm' tanpa zona.

function partsIn(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') }
}

/** Selisih (ms) zona waktu terhadap UTC pada saat tertentu. */
function offsetMs(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000
}

/** ISO (UTC) -> 'YYYY-MM-DDTHH:mm' di zona waktu site; '' bila kosong. */
export function isoToZonedInput(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return ''
  const p = partsIn(new Date(iso), timeZone)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

/** 'YYYY-MM-DDTHH:mm' di zona waktu site -> ISO UTC; null bila kosong atau tidak valid. */
export function zonedInputToIso(value: string, timeZone: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!m) return null
  const asUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
  // Dua langkah agar tepat di sekitar pergantian DST (zona tanpa DST cukup satu).
  let guess = asUtc - offsetMs(new Date(asUtc), timeZone)
  guess = asUtc - offsetMs(new Date(guess), timeZone)
  return new Date(guess).toISOString()
}

/** Label singkat zona waktu, mis. 'WIB' untuk Asia/Jakarta. */
export function zoneLabel(timeZone: string, locale = 'id-ID'): string {
  return new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'short' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? timeZone
}
