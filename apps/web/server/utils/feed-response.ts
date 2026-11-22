// Respons feed (sitemap, RSS, robots) untuk site request ini. Middleware
// site sudah menolak Host tak dikenal (404) dan mengalihkan alias (301).
import { setResponseStatus, type RequestEvent } from 'nuxt/server'
import { setPublicCache } from './cache-control'

export async function feedResponse(
  event: RequestEvent,
  contentType: string,
  render: (site: NonNullable<RequestEvent['context']['site']>, origin: string) => Promise<string> | string,
): Promise<string> {
  const { site, siteOrigin } = event.context
  if (!site || !siteOrigin) {
    setResponseStatus(event, 404)
    return ''
  }
  const body = await render(site, siteOrigin)
  event.res.headers.set('content-type', contentType)
  // TTL sama dengan halaman: satu batas keterlambatan untuk artikel terjadwal.
  setPublicCache(event, 200)
  return body
}
