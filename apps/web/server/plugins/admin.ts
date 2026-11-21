// Validasi konfigurasi admin saat server start (ADR-009): nilai yang salah
// membuat proses gagal start; tanpa secret, admin nonaktif dan dicatat.
import { useAdminConfig } from '../utils/admin'

export default defineNitroPlugin(() => {
  const config = useAdminConfig()
  if (!config.enabled) console.info(`[admin] nonaktif: ${config.reason}`)
  else console.info(config.mode === 'multi' ? `[admin] aktif di host ${config.host}` : '[admin] aktif di domain site')
})
