// POST /api/admin/logout: hapus sesi. Selalu 200, juga tanpa sesi.
import { defineEventHandler } from 'nuxt/server'
import { useAdminSession } from '../../utils/admin'

export default defineEventHandler(async (event) => {
  const session = await useAdminSession(event)
  await session.clear()
  return { ok: true }
})
