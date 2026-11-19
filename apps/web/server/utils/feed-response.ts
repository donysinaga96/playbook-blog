// Respons feed (sitemap, RSS, robots) untuk site request ini. Middleware
// site sudah menolak Host tak dikenal (404) dan mengalihkan alias (301).
import { setResponseStatus, type RequestEvent } from 'nuxt/server'

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
  // Feed boleh sedikit basi; cukup segar untuk artikel terjadwal yang baru tayang.
  event.res.headers.set('cache-control', 'public, max-age=300')
  return body
}
