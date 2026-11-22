// Penjadwal tarik data pendapatan (ADR-011). Opt-in: REVENUE_SCHEDULER=true.
//
// Setiap menit memeriksa sumber yang sudah waktunya (sync_interval_minutes
// sejak last_sync_at) lalu menjalankannya satu per satu. Aman bila tombol
// "Sync sekarang" ditekan bersamaan: database hanya mengizinkan satu run
// berjalan per sumber. Untuk lebih dari satu replika, matikan ini dan
// jalankan `pnpm revenue:sync --due` dari cron/systemd timer di satu mesin.
import { log } from '../utils/log'
import { useRevenueService } from '../utils/revenue'

const TICK_MS = 60_000

export default defineNitroPlugin((nitroApp) => {
  if (process.env['REVENUE_SCHEDULER'] !== 'true') return
  let busy = false
  const tick = async () => {
    if (busy) return
    busy = true
    try {
      const service = useRevenueService()
      for (const source of await service.dueSources(new Date())) {
        const result = await service.sync(source.code, { trigger: 'schedule' }).catch((error: unknown) => {
          log('warn', 'sync pendapatan dilewati', { source: source.code, error })
          return null
        })
        if (result) log(result.status === 'failed' ? 'warn' : 'info', 'sync pendapatan', { source: source.code, status: result.status, mock: result.mock, ...result.counts, error: result.error ?? undefined })
      }
    } catch (error) {
      log('error', 'penjadwal pendapatan gagal', { error })
    } finally {
      busy = false
    }
  }
  const timer = setInterval(() => void tick(), TICK_MS)
  timer.unref()
  log('info', 'penjadwal pendapatan aktif', { everySeconds: TICK_MS / 1000 })
  nitroApp.hooks.hook('close', () => clearInterval(timer))
})
