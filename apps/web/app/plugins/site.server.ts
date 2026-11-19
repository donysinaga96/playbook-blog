// Khusus server (.server.ts), tidak ikut ke bundle browser. Menyalin hasil
// server/middleware/site.ts (event.context) ke state halaman (ADR-007):
// theme diselesaikan lewat registry, view model dipakai apa adanya.
//
// Kode app/ tidak pernah memanggil repository; dari @framework/core hanya
// boleh import tipe (dijaga ESLint).
import { templateRegistry } from '../templates'

// Issue theme yang sama cukup dicatat sekali per proses, bukan setiap request.
const loggedIssues = new Set<string>()
const MAX_LOGGED = 1000

export default defineNuxtPlugin(() => {
  const event = useRequestEvent()
  const context = event?.context
  const site = context?.site
  const page = context?.page
  if (!event || !site || !page) {
    // Request tanpa halaman yang sampai ke renderer (mis. /api/tidak-ada).
    if (event) setResponseStatus(event, 404)
    return
  }

  const theme = templateRegistry.resolveTheme(context.theme ?? null)
  for (const issue of theme.issues) {
    const key = `${site.id}:${issue}`
    if (loggedIssues.has(key) || loggedIssues.size >= MAX_LOGGED) continue
    loggedIssues.add(key)
    console.warn(`[theme] site ${site.code}: ${issue}`)
  }

  useSiteTheme().value = theme
  usePageState().value = page
  if (page.status !== 200) setResponseStatus(event, page.status)
})
