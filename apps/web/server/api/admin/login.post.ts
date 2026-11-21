// POST /api/admin/login { email, password } (ADR-009).
// Pesan gagal sama untuk semua sebab; percobaan dibatasi per IP + email.
import { PASSWORD_MAX, verifyPassword } from '@framework/core'
import { createError, defineEventHandler, readValidatedBody } from 'nuxt/server'
import { z } from 'zod'
import { clientIp, loginThrottle, useAdminSession } from '../../utils/admin'
import { useRepositories } from '../../utils/database'
import { useSiteMode } from '../../utils/site-mode'

const body = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(PASSWORD_MAX),
})

export default defineEventHandler(async (event) => {
  const session = await useAdminSession(event)
  const input = await readValidatedBody(event, (raw) => body.parse(raw)).catch(() => {
    throw createError({ statusCode: 400, statusMessage: 'Email dan password wajib diisi' })
  })
  const ip = clientIp(event)

  // Dicatat sebelum verifikasi (async), agar request paralel tidak lolos semua.
  const wait = loginThrottle.begin(ip, input.email)
  if (wait > 0) {
    event.res.headers.set('retry-after', String(wait))
    throw createError({ statusCode: 429, statusMessage: 'Terlalu banyak percobaan login. Coba lagi nanti.' })
  }

  const users = useRepositories().users
  const candidate = await users.findForLogin(input.email)
  const ok = await verifyPassword(candidate?.passwordHash ?? null, input.password)
  // Superadmin atau anggota site; user tanpa site tidak punya apa pun untuk dikelola.
  const sites = ok && candidate ? await users.listSites(candidate, useSiteMode()) : []
  if (!ok || !candidate || sites.length === 0) {
    throw createError({ statusCode: 401, statusMessage: 'Email atau password salah' })
  }

  loginThrottle.success(ip, input.email)
  // Sesi baru setiap login (id sesi lama tidak dipakai ulang).
  await session.clear()
  await session.update({ userId: candidate.id })
  await users.recordLogin(candidate.id)
  const user = { id: candidate.id, email: candidate.email, displayName: candidate.displayName, isSuperadmin: candidate.isSuperadmin }
  return { user, sites }
})
