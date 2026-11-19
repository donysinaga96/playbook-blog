// Validasi SITE_MODE / SITE_CODE saat server start, bukan saat request
// pertama: config salah harus membuat proses gagal start.
//
// Folder server/plugins/ adalah satu-satunya tempat yang sengaja memakai
// API Nitro (defineNitroPlugin); nuxt/server di Nuxt 4.6 belum punya
// padanannya. Saat upgrade ke Nuxt 5, cukup folder ini yang diperiksa.
import { useSiteMode } from '../utils/site-mode'

export default defineNitroPlugin(() => {
  const mode = useSiteMode()
  console.info(mode.mode === 'single' ? `[site] mode single, SITE_CODE=${mode.siteCode}` : '[site] mode multi')
})
