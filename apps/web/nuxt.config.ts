// Satu aplikasi Nuxt untuk public site, /admin, dan server API (ADR-002).
// Logika domain ada di @framework/core; aplikasi ini hanya merangkai
// request -> core -> template.
export default defineNuxtConfig({
  compatibilityDate: '2026-11-19',
  devtools: { enabled: false },
  typescript: { strict: true },
  // Admin adalah SPA (ADR-009): tanpa SSR, tanpa SEO, tanpa risiko hidrasi.
  routeRules: {
    '/admin': { ssr: false },
    '/admin/**': { ssr: false },
    // Pratinjau tema: halaman publik yang dirender di server (ADR-007).
    '/admin/preview/**': { ssr: true },
  },
  // Paket workspace diekspor sebagai source TypeScript (./src/index.ts),
  // jadi harus ikut di-bundle, bukan di-import dari node_modules saat runtime.
  // Server juga memakai entry ./manifest template (ADR-008).
  nitro: {
    externals: { inline: ['@framework/core', '@framework/db', '@framework/template-kit', /^@framework\/template-/] },
  },
})
