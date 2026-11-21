// Khusus server (.server.ts), tidak ikut ke bundle browser. Menyalin hasil
// server/middleware/site.ts (event.context) ke state halaman (ADR-007).
// Theme sudah diselesaikan di middleware (ADR-008); issue-nya dicatat di sana.
//
// Kode app/ tidak pernah memanggil repository; dari @framework/core hanya
// boleh import tipe (dijaga ESLint).
export default defineNuxtPlugin(() => {
  const event = useRequestEvent()
  const context = event?.context
  const site = context?.site
  const page = context?.page
  if (!event || !site || !page || !context.theme) {
    // Request tanpa halaman yang sampai ke renderer (mis. /api/tidak-ada).
    if (event) setResponseStatus(event, 404)
    return
  }

  // Hanya field yang dibutuhkan renderer; issue dan layout tidak dikirim ke
  // browser (payload Nuxt terbaca publik).
  const { templateKey, templateVersion, rootClass, tokens, options, css } = context.theme
  useSiteTheme().value = { templateKey, templateVersion, rootClass, tokens, options, css }
  usePageState().value = page
  if (page.status !== 200) setResponseStatus(event, page.status)
})
