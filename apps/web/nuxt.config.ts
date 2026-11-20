// Satu aplikasi Nuxt untuk public site, /admin, dan server API (ADR-002).
// Logika domain ada di @framework/core; aplikasi ini hanya merangkai
// request -> core -> template.
export default defineNuxtConfig({
  compatibilityDate: '2026-11-19',
  devtools: { enabled: false },
  typescript: { strict: true },
  // Paket workspace diekspor sebagai source TypeScript (./src/index.ts),
  // jadi harus ikut di-bundle, bukan di-import dari node_modules saat runtime.
  nitro: {
    externals: { inline: ['@framework/core', '@framework/db'] },
  },
})
