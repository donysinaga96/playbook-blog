// Validasi SITE_MODE / SITE_CODE dan PUBLIC_CACHE_TTL saat server start, bukan saat request
// pertama: config salah harus membuat proses gagal start.
//
// Folder server/plugins/ adalah satu-satunya tempat yang sengaja memakai
// API Nitro (defineNitroPlugin); nuxt/server di Nuxt 4.6 belum punya
// padanannya. Saat upgrade ke Nuxt 5, cukup folder ini yang diperiksa.
import { publicCacheTtl } from '../utils/cache-control'
import { useSiteMode } from '../utils/site-mode'

export default defineNitroPlugin(() => {
  const mode = useSiteMode()
  console.info(mode.mode === 'single' ? `[site] mode single, SITE_CODE=${mode.siteCode}` : '[site] mode multi')
  // PUBLIC_CACHE_TTL salah = gagal start, bukan galat di request pertama.
  console.info(`[site] cache publik s-maxage=${publicCacheTtl()} detik`)
})
