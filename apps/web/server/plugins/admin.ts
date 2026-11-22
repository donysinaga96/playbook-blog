// Validasi konfigurasi admin saat server start (ADR-009): nilai yang salah
// membuat proses gagal start; tanpa secret, admin nonaktif dan dicatat.
import { useAdminConfig } from '../utils/admin'
import { log } from '../utils/log'

export default defineNitroPlugin(() => {
  const config = useAdminConfig()
  if (!config.enabled) log('info', 'admin nonaktif', { reason: config.reason })
  else log('info', 'admin aktif', { mode: config.mode, host: config.mode === 'multi' ? config.host : undefined })
})
