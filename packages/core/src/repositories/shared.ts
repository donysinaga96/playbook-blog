import { and, eq, inArray, isNotNull, lte, media, type PgColumn, type SQL } from '@framework/db'
import type { MediaRef, RepositoryContext, SiteId } from './types'

/**
 * Aturan tampil publik: status PUBLISHED dan published_at sudah lewat.
 * Artikel terjadwal = PUBLISHED dengan published_at di masa depan (tanpa queue).
 */
export function publiclyVisible(
  table: { status: PgColumn; publishedAt: PgColumn },
  now: Date,
): SQL {
  return and(eq(table.status, 'PUBLISHED'), isNotNull(table.publishedAt), lte(table.publishedAt, now)) as SQL
}

export const mediaColumns = {
  id: media.id,
  storageKey: media.storageKey,
  mimeType: media.mimeType,
  width: media.width,
  height: media.height,
  altText: media.altText,
  caption: media.caption,
  credit: media.credit,
  focalX: media.focalX,
  focalY: media.focalY,
}

/** Media milik site tertentu, per id. Media site lain tidak pernah ikut. */
export async function loadMedia(
  { db }: RepositoryContext,
  siteId: SiteId,
  ids: (string | null | undefined)[],
): Promise<Map<string, MediaRef>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (wanted.length === 0) return new Map()
  const rows = await db
    .select(mediaColumns)
    .from(media)
    .where(and(eq(media.siteId, siteId), inArray(media.id, wanted)))
  return new Map(rows.map((r) => [r.id, r]))
}
