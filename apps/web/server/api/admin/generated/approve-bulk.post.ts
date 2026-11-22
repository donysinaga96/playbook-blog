// POST { items: [{ siteId, id, expectedUpdatedAt }] }: terbitkan sekarang
// beberapa hasil AI sekaligus. Setiap item satu transaksi sendiri: yang
// punya galat atau sudah diubah agent dilaporkan, yang lain tetap terbit.
import { EditorError } from '@framework/core'
import { createError, defineEventHandler, readBody } from 'nuxt/server'
import { requireAdmin } from '../../../utils/admin'
import { useRepositories } from '../../../utils/database'
import { useMediaStorage } from '../../../utils/media'
import { log } from '../../../utils/log'

const MAX_ITEMS = 50

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = ((await readBody(event)) ?? {}) as { items?: unknown }
  const items = Array.isArray(body.items) ? body.items : []
  if (items.length === 0 || items.length > MAX_ITEMS) throw createError({ statusCode: 422, statusMessage: `pilih 1 sampai ${MAX_ITEMS} hasil AI` })
  const { generated } = useRepositories()
  const storage = useMediaStorage()
  const results = []
  for (const raw of items) {
    const item = (raw ?? {}) as { siteId?: unknown; id?: unknown; expectedUpdatedAt?: unknown }
    const siteId = String(item.siteId ?? '')
    const id = String(item.id ?? '')
    if (!admin.sites.some((s) => s.id === siteId)) {
      results.push({ siteId, id, ok: false, message: 'Site tidak ditemukan' })
      continue
    }
    try {
      const { article } = await generated.approve(siteId, id, { mode: 'publish', expectedUpdatedAt: String(item.expectedUpdatedAt ?? '') }, admin.user.id, storage)
      results.push({ siteId, id, ok: true, articleId: article.id, publicPath: article.publicPath })
    } catch (error) {
      // Item sebelumnya sudah terbit (transaksi sendiri), jadi galat apa pun
      // dilaporkan per item, tidak menggagalkan seluruh respons.
      if (!(error instanceof EditorError)) log('error', 'approve-bulk gagal', { id: event.context.requestId, siteId, generatedId: id, error })
      results.push({ siteId, id, ok: false, message: error instanceof EditorError ? error.message : 'galat server; lihat log' })
    }
  }
  return { results }
})
