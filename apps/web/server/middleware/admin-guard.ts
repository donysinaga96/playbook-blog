// Penjaga API admin (ADR-009), berjalan sebelum route /api/admin/*:
//  - request non-GET wajib membawa Origin yang sama dengan origin request
//    (menutup CSRF bersama cookie SameSite=Lax, tanpa token);
//  - respons tidak boleh di-cache.
// Path dicek setelah di-decode seperti router (routedPath). Pemeriksaan host
// dan Origin diulang di handler lewat useAdminSession (assertAdminRequest);
// login dan hak akses diperiksa di route lewat requireAdmin.
import { defineEventHandler, getRequestURL } from 'nuxt/server'
import { assertAdminRequest, routedPath } from '../utils/admin'

export default defineEventHandler((event) => {
  const path = routedPath(getRequestURL(event).pathname)
  if (!path.startsWith('/api/admin/') && path !== '/api/admin') return
  event.res.headers.set('cache-control', 'no-store')
  // Host (mode multi) dan, untuk method non-GET, Origin.
  assertAdminRequest(event)
})
