// GET /api/admin/me: user login dan site yang boleh dikelolanya; 401 tanpa sesi.
import { defineEventHandler } from 'nuxt/server'
import { requireAdmin, useAdminConfig } from '../../utils/admin'

export default defineEventHandler(async (event) => {
  const { user, sites } = await requireAdmin(event)
  const config = useAdminConfig()
  return { user, sites, mode: config.enabled ? config.mode : null }
})
