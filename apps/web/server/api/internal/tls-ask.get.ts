// GET /api/internal/tls-ask?domain=<host>  -  dipanggil Caddy sebelum
// menerbitkan sertifikat on-demand (ADR-012). 200 = boleh, 404 = tidak.
// Path /api/internal/* diblokir di Caddyfile, jadi hanya bisa dipanggil dari
// jaringan internal compose; jawabannya pun hanya "domain ini kami layani".
import { normalizeHost } from '@framework/core'
import { defineEventHandler, getQuery, setResponseStatus } from 'nuxt/server'
import { useAdminConfig } from '../../utils/admin'
import { useRepositories } from '../../utils/database'
import { useSiteMode } from '../../utils/site-mode'
import { isCertificateAllowed } from '../../utils/tls-ask'

export default defineEventHandler(async (event) => {
  event.res.headers.set('cache-control', 'no-store')
  const domain = getQuery(event)['domain']
  const admin = useAdminConfig()
  const allowed = await isCertificateAllowed(typeof domain === 'string' ? domain : undefined, {
    mode: useSiteMode(),
    sites: useRepositories().sites,
    adminHost: admin.enabled && admin.mode === 'multi' ? normalizeHost(admin.host) : null,
  })
  setResponseStatus(event, allowed ? 200 : 404)
  return allowed ? 'ok\n' : 'tidak dikenal\n'
})
