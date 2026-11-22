// Dashboard pendapatan (ADR-011) di browser: akses API, format uang/tanggal,
// preset rentang, dan warna seri per sumber. Data datang dari
// /api/admin/revenue/* (hanya superadmin); uang tiba sebagai teks desimal.

/**
 * Warna seri: palet kategorikal tervalidasi (skill dataviz; CVD aman untuk
 * pasangan bersebelahan), diberikan menurut URUTAN SUMBER (sort_order), bukan
 * peringkat, sehingga warna AdSense tetap sama walau filter berubah.
 */
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#6250d6', '#008300', '#e34948']
/** Teks di atas isian warna: hitam di kuning, putih di lainnya. */
export const SERIES_INK = ['#ffffff', '#ffffff', '#ffffff', '#0b0b0b', '#ffffff', '#ffffff', '#ffffff', '#ffffff']

export interface SourceInfo {
  id: string
  code: string
  name: string
  connector: 'lynk' | 'adsterra' | 'adsense' | 'headless' | 'generic'
  integrationType: 'webhook' | 'api' | 'csv_import' | 'headless' | 'manual'
  isActive: boolean
  defaultCurrency: string
  config: Record<string, unknown>
  credentialsEnv: string | null
  syncIntervalMinutes: number | null
  lookbackDays: number
  sortOrder: number
  lastSyncAt: string | null
  lastSyncStatus: string | null
  updatedAt: string
  mock: boolean
  credentials: { required: string[]; missing: string[]; configured: boolean }
  webhookUrl: string | null
  canSync: boolean
}

export interface PropertyInfo {
  id: string
  code: string
  name: string
  domain: string | null
  siteId: string | null
  siteCode: string | null
  status: 'ACTIVE' | 'ARCHIVED'
  updatedAt: string
}

export type LedgerStatus = 'estimated' | 'finalized' | 'adjusted' | 'refunded'

export const STATUS_TEXT: Record<LedgerStatus, string> = {
  estimated: 'Sementara',
  finalized: 'Final',
  adjusted: 'Koreksi',
  refunded: 'Refund',
}

export const CHANNEL_TEXT: Record<string, string> = {
  webhook: 'Webhook',
  api: 'API',
  csv_import: 'Impor file',
  headless: 'Otomasi browser',
  manual: 'Manual',
}

/** $fetch ke /api/admin/revenue/<path>; 401 -> login, 404 (bukan superadmin) dibiarkan ke pemanggil. */
export async function revenueApi<T>(path: string, options: Parameters<typeof $fetch>[1] = {}): Promise<T> {
  try {
    return (await $fetch<T>(`/api/admin/revenue/${path.replace(/^\//, '')}`, options as never)) as T
  } catch (e) {
    if (apiStatus(e) === 401) {
      useAdminMe().value = null
      await navigateTo('/admin/login')
    }
    throw e
  }
}

/** Sumber & situs untuk navigasi rail; dimuat sekali, disegarkan setelah perubahan. */
export function useRevenueNav() {
  return useState<{ sources: SourceInfo[]; properties: PropertyInfo[]; settings: { baseCurrency: string; timeZone: string }; headlessEnabled: boolean; schedulerEnabled: boolean } | null>('revenue-nav', () => null)
}

export async function refreshRevenueNav() {
  useRevenueNav().value = await revenueApi('sources')
}

export function colorFor(code: string, sources: Pick<SourceInfo, 'code'>[]): string {
  const i = sources.findIndex((s) => s.code === code)
  return SERIES_COLORS[(i < 0 ? sources.length : i) % SERIES_COLORS.length] as string
}

export function inkFor(code: string, sources: Pick<SourceInfo, 'code'>[]): string {
  const i = sources.findIndex((s) => s.code === code)
  return SERIES_INK[(i < 0 ? sources.length : i) % SERIES_INK.length] as string
}

// ---------- angka ----------

const nf = new Map<string, Intl.NumberFormat>()
function formatter(key: string, make: () => Intl.NumberFormat) {
  let f = nf.get(key)
  if (!f) {
    f = make()
    nf.set(key, f)
  }
  return f
}

/** 'Rp 1.234.567' / 'US$ 12,50'. IDR tanpa desimal, lainnya 2 desimal (USD kecil: hingga 3). */
export function formatMoney(value: string | number | null | undefined, currency: string, opts: { precise?: boolean } = {}): string {
  if (value === null || value === undefined || value === '') return '-'
  const n = Number(value)
  // 3 desimal hanya bila nilainya memang punya digit ketiga (mis. revenue Adsterra 1.154).
  const third = opts.precise && Math.abs(n) < 10 && Math.round(n * 1000) % 10 !== 0
  const digits = currency === 'IDR' || currency === 'JPY' ? 0 : third ? 3 : 2
  return formatter(`m:${currency}:${digits}`, () => new Intl.NumberFormat('id-ID', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits })).format(n)
}

/** Ringkas untuk sumbu dan label: 'Rp 1,2 jt', 'Rp 980 rb'. */
export function formatMoneyCompact(value: number, currency: string): string {
  return formatter(`c:${currency}`, () => new Intl.NumberFormat('id-ID', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 })).format(value)
}

export function formatNumber(value: string | number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || value === '') return '-'
  return formatter(`n:${digits}`, () => new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits, minimumFractionDigits: 0 })).format(Number(value))
}

/** Perubahan relatif; null bila pembanding nol. */
export function changeRatio(current: string | number, previous: string | number): number | null {
  const c = Number(current)
  const p = Number(previous)
  if (!p) return null
  return (c - p) / Math.abs(p)
}

export function formatChange(ratio: number | null): string {
  if (ratio === null) return 'tanpa pembanding'
  const pct = formatter('pct', () => new Intl.NumberFormat('id-ID', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' })).format(ratio)
  return pct
}

// ---------- tanggal ----------

const df = new Map<string, Intl.DateTimeFormat>()

/** '1 Nov' atau '1 Nov 2026' dari tanggal kalender (tanpa geser zona waktu). */
export function formatDay(iso: string, withYear = false): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const key = withYear ? 'y' : 'n'
  let f = df.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', ...(withYear && { year: 'numeric' }), timeZone: 'UTC' })
    df.set(key, f)
  }
  return f.format(new Date(Date.UTC(y, m - 1, d)))
}

export function formatRange(from: string, to: string): string {
  if (from === to) return formatDay(from, true)
  const sameYear = from.slice(0, 4) === to.slice(0, 4)
  return `${formatDay(from, !sameYear)} – ${formatDay(to, true)}`
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

/** "3 menit lalu", "2 jam lalu", "kemarin". */
export function formatAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'belum pernah'
  const diff = Math.max(0, now - new Date(iso).getTime())
  const minutes = Math.round(diff / 60_000)
  if (minutes < 1) return 'baru saja'
  if (minutes < 60) return `${minutes} menit lalu`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} jam lalu`
  const days = Math.round(hours / 24)
  return days === 1 ? 'kemarin' : `${days} hari lalu`
}

export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export type PresetKey = '7d' | '30d' | '90d' | 'mtd' | 'last-month' | 'ytd' | 'custom'

export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: '7d', label: '7 hari' },
  { key: '30d', label: '30 hari' },
  { key: '90d', label: '90 hari' },
  { key: 'mtd', label: 'Bulan ini' },
  { key: 'last-month', label: 'Bulan lalu' },
  { key: 'ytd', label: 'Tahun ini' },
]

export function presetRange(key: PresetKey, today: string): { from: string; to: string } {
  const monthStart = `${today.slice(0, 7)}-01`
  switch (key) {
    case '7d': return { from: addDaysIso(today, -6), to: today }
    case '90d': return { from: addDaysIso(today, -89), to: today }
    case 'mtd': return { from: monthStart, to: today }
    case 'last-month': {
      const end = addDaysIso(monthStart, -1)
      return { from: `${end.slice(0, 7)}-01`, to: end }
    }
    case 'ytd': return { from: `${today.slice(0, 4)}-01-01`, to: today }
    default: return { from: addDaysIso(today, -29), to: today }
  }
}

/** Semua bucket (hari/minggu Senin/bulan) dalam rentang, sama dengan date_trunc PostgreSQL. */
export function bucketsFor(from: string, to: string, granularity: 'day' | 'week' | 'month'): string[] {
  const out: string[] = []
  if (granularity === 'month') {
    let d = `${from.slice(0, 7)}-01`
    while (d <= to) {
      out.push(d)
      const [y, m] = d.split('-').map(Number) as [number, number]
      d = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
    }
    return out
  }
  if (granularity === 'week') {
    const start = new Date(`${from}T00:00:00Z`)
    const dow = (start.getUTCDay() + 6) % 7
    let d = addDaysIso(from, -dow)
    while (d <= to) {
      out.push(d)
      d = addDaysIso(d, 7)
    }
    return out
  }
  for (let d = from; d <= to; d = addDaysIso(d, 1)) out.push(d)
  return out
}

export function bucketLabel(bucket: string, granularity: 'day' | 'week' | 'month'): string {
  if (granularity === 'month') {
    const [y, m] = bucket.split('-').map(Number) as [number, number]
    return new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)))
  }
  if (granularity === 'week') return `Minggu ${formatDay(bucket)}`
  return formatDay(bucket)
}
