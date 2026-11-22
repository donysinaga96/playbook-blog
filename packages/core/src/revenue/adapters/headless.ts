// Runner otomasi browser / headless scraper (opsional, terisolasi).
//
// Jalur ini paling rapuh (perubahan UI, 2FA, CAPTCHA) dan menyangkut Terms
// of Service platform, jadi:
//   - NONAKTIF secara bawaan: butuh REVENUE_HEADLESS_ENABLED=true DAN
//     config.enabled=true di sumbernya; tanpa keduanya, sync ditolak;
//   - tidak ada scraper sungguhan di repo. Scraper didaftarkan lewat
//     registerHeadlessScraper (mis. modul terpisah yang memakai Playwright),
//     dan hanya menghasilkan LedgerInput, sama seperti adapter API;
//   - setiap jalan tercatat di revenue_sync_runs (channel headless) dengan
//     batas waktu, sehingga kegagalannya tidak memengaruhi sumber lain.
import type { LedgerInput } from '../types'
import { RevenueError } from '../types'
import { eachDate } from '../dates'
import { unitHash } from './mock-fetch'

export interface HeadlessContext {
  range: { start: string; end: string }
  config: Record<string, unknown>
  /** Kredensial dari env (awalan credentials_env), tidak pernah dari database. */
  env: (name: string) => string | undefined
  log: (message: string) => void
  signal: AbortSignal
}

export interface HeadlessScraper {
  key: string
  description: string
  run(ctx: HeadlessContext): Promise<LedgerInput[]>
}

const registry = new Map<string, HeadlessScraper>()

export function registerHeadlessScraper(scraper: HeadlessScraper): void {
  registry.set(scraper.key, scraper)
}

export function getHeadlessScraper(key: string): HeadlessScraper | undefined {
  return registry.get(key)
}

export function listHeadlessScrapers(): { key: string; description: string }[] {
  return [...registry.values()].map(({ key, description }) => ({ key, description }))
}

export function headlessGloballyEnabled(env: Record<string, string | undefined>): boolean {
  return env['REVENUE_HEADLESS_ENABLED'] === 'true'
}

/** Jalankan scraper dengan batas waktu; galat apa pun menjadi RevenueError yang tercatat di log run. */
export async function runHeadless(scraper: HeadlessScraper, ctx: Omit<HeadlessContext, 'signal'>, timeoutMs = 120_000): Promise<LedgerInput[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await Promise.race([
      scraper.run({ ...ctx, signal: controller.signal }),
      new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new RevenueError(`scraper ${scraper.key} melewati batas waktu ${timeoutMs / 1000} detik`)))),
    ])
  } finally {
    clearTimeout(timer)
  }
}

// Scraper contoh untuk mode mock: tidak membuka browser, hanya
// menghasilkan angka deterministik agar alur headless bisa diuji ujung ke ujung.
registerHeadlessScraper({
  key: 'mock',
  description: 'Contoh (tanpa browser): angka deterministik untuk menguji alur headless',
  async run(ctx) {
    ctx.log(`mock: ${ctx.range.start} s.d. ${ctx.range.end}`)
    return eachDate(ctx.range.start, ctx.range.end).map((date) => ({
      idempotencyKey: `headless-mock:${date}`,
      reportDate: date,
      grossAmount: (5 + unitHash(`headless:${date}`) * 3).toFixed(2),
      currency: 'USD',
      status: 'estimated' as const,
      description: 'Contoh headless',
    }))
  },
})
