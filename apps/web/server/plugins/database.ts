// Menutup pool database saat server berhenti.
//
// Memakai API Nitro (defineNitroPlugin, hook 'close') karena nuxt/server
// di Nuxt 4.6 belum menyediakan hook shutdown. Hanya file di server/plugins/
// yang boleh begitu; saat upgrade ke Nuxt 5, cukup folder ini yang diperiksa.
import { closeDatabase } from '../utils/database'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('close', closeDatabase)
})
