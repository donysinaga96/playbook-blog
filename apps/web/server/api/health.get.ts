// GET /api/health  -  apakah server dan database bisa melayani request.
// Dipakai untuk cek manual sekarang dan health check container di produksi.
// Detail error hanya masuk log server, tidak dikirim ke klien.
import { sql } from '@framework/db'
import { defineEventHandler, setResponseStatus } from 'nuxt/server'
import { useDatabase } from '../utils/database'
import { log } from '../utils/log'

export default defineEventHandler(async (event) => {
  try {
    await useDatabase().execute(sql`select 1`)
    return { status: 'ok' as const, database: 'ok' as const }
  } catch (error) {
    log('error', 'health: database tidak bisa dihubungi', { error })
    setResponseStatus(event, 503)
    return { status: 'error' as const, database: 'unreachable' as const }
  }
})
