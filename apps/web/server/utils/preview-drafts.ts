// Draf pratinjau tema (M4 4.4) di memori proses, dengan id per draf.
//
// Bukan di cookie sesi: cookie tersegel bisa melewati ~4 KB (browser lalu
// membuangnya tanpa galat), dan satu draf per sesi membuat dua tab saling
// menimpa. Dengan id di URL pratinjau, setiap iframe memuat drafnya sendiri.
// Cukup untuk satu proses (sama seperti pembatas login, ADR-009).
import { randomUUID } from 'node:crypto'

export interface PreviewDraft {
  userId: string
  siteId: string
  templateKey: string
  tokens: Record<string, unknown>
  options: Record<string, unknown>
  layouts: Record<string, unknown>
}

const TTL_MS = 30 * 60_000
const MAX_DRAFTS = 500
const drafts = new Map<string, PreviewDraft & { expiresAt: number }>()

function prune(now: number) {
  for (const [id, d] of drafts) if (d.expiresAt <= now) drafts.delete(id)
  while (drafts.size >= MAX_DRAFTS) drafts.delete(drafts.keys().next().value as string)
}

/** Simpan draf; id lama (draf dari tab yang sama) diganti bila milik user yang sama. */
export function savePreviewDraft(draft: PreviewDraft, replaceId?: string): string {
  const now = Date.now()
  prune(now)
  const existing = replaceId ? drafts.get(replaceId) : undefined
  const id = existing && existing.userId === draft.userId ? (replaceId as string) : randomUUID()
  drafts.set(id, { ...draft, expiresAt: now + TTL_MS })
  return id
}

/** Draf milik user ini untuk site ini; null bila tidak ada, kedaluwarsa, atau milik orang lain. */
export function getPreviewDraft(id: string | null | undefined, userId: string, siteId: string): PreviewDraft | null {
  if (!id) return null
  const d = drafts.get(id)
  if (!d || d.expiresAt <= Date.now() || d.userId !== userId || d.siteId !== siteId) return null
  return d
}

export function deletePreviewDraft(id: string, userId: string) {
  if (drafts.get(id)?.userId === userId) drafts.delete(id)
}
