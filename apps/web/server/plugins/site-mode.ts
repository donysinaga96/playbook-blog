// Validasi SITE_MODE / SITE_CODE dan PUBLIC_CACHE_TTL saat server start, bukan saat request
// pertama: config salah harus membuat proses gagal start.
//
// Folder server/plugins/ adalah satu-satunya tempat yang sengaja memakai
// API Nitro (defineNitroPlugin); nuxt/server di Nuxt 4.6 belum punya
// padanannya. Saat upgrade ke Nuxt 5, cukup folder ini yang diperiksa.
import { publicCacheTtl } from '../utils/cache-control'
import { useSiteMode } from '../utils/site-mode'
import { log } from '../utils/log'

export default defineNitroPlugin(() => {
  const mode = useSiteMode()
  log('info', 'site mode', { mode: mode.mode, siteCode: mode.mode === 'single' ? mode.siteCode : undefined })
  // PUBLIC_CACHE_TTL salah = gagal start, bukan galat di request pertama.
  log('info', 'cache publik', { sMaxAge: publicCacheTtl() })
})
