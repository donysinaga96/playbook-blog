// Akses database sebagai role blog_agent. Hanya kolom yang diizinkan
// (packages/db/scripts/agent_role.sql) yang boleh di-SELECT: `SELECT *` ditolak.
import type pg from 'pg'

export interface SiteContext {
  site: { id: string; code: string; name: string }
  categories: { slug: string; name: string; parentSlug: string | null }[]
  authors: { slug: string; name: string }[]
  tags: string[]
  /** Alasan penolakan terbaru: bahan belajar untuk run berikutnya. */
  rejections: { externalId: string; reviewNote: string }[]
  /** Judul hasil AI terbaru (semua status): agar topik tidak diulang. */
  recentTitles: string[]
}

export async function loadContext(db: pg.Client, siteCode: string): Promise<SiteContext> {
  const sites = await db.query<{ id: string; code: string; name: string; status: string }>(
    'SELECT id, code, name, status FROM sites WHERE code = $1', [siteCode])
  const site = sites.rows[0]
  if (!site) throw new Error(`site "${siteCode}" tidak ditemukan`)

  // Hanya kategori dan penulis ACTIVE yang lolos pemeriksaan approval.
  const categories = await db.query<{ slug: string; name: string; parent_slug: string | null }>(
    `SELECT c.slug, c.name, p.slug AS parent_slug
       FROM categories c LEFT JOIN categories p ON p.id = c.parent_id
      WHERE c.site_id = $1 AND c.status = 'ACTIVE'
      ORDER BY c.name`, [site.id])
  const authors = await db.query<{ slug: string; name: string }>(
    `SELECT slug, name FROM authors WHERE site_id = $1 AND status = 'ACTIVE' ORDER BY name`, [site.id])
  const tags = await db.query<{ name: string }>(
    'SELECT name FROM tags WHERE site_id = $1 ORDER BY name', [site.id])
  const rejections = await db.query<{ external_id: string; review_note: string }>(
    `SELECT external_id, review_note FROM generated_articles
      WHERE site_id = $1 AND status = 'ARCHIVED'
      ORDER BY reviewed_at DESC LIMIT 10`, [site.id])
  const recent = await db.query<{ title: string | null }>(
    `SELECT payload->>'title' AS title FROM generated_articles
      WHERE site_id = $1 ORDER BY generated_at DESC LIMIT 30`, [site.id])

  return {
    site: { id: site.id, code: site.code, name: site.name },
    categories: categories.rows.map((r) => ({ slug: r.slug, name: r.name, parentSlug: r.parent_slug })),
    authors: authors.rows,
    tags: tags.rows.map((r) => r.name),
    rejections: rejections.rows.map((r) => ({ externalId: r.external_id, reviewNote: r.review_note })),
    recentTitles: recent.rows.flatMap((r) => (r.title ? [r.title] : [])),
  }
}

export type UpsertResult = 'inserted' | 'updated' | 'already-decided'

/**
 * Tulis satu hasil (contoh SQL di docs/kontrak-agent.md). external_id yang
 * sama memperbarui baris yang masih READY_TO_PUBLISH; baris yang sudah
 * diputuskan tidak berubah (0 baris).
 */
export async function upsertGenerated(
  db: pg.Client,
  input: { siteId: string; externalId: string; payload: unknown; agentNote: string | null },
): Promise<UpsertResult> {
  const result = await db.query<{ inserted: boolean }>(
    `INSERT INTO generated_articles (site_id, external_id, payload, agent_note)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (site_id, external_id) DO UPDATE
        SET payload = EXCLUDED.payload,
            agent_note = EXCLUDED.agent_note,
            generated_at = now()
      WHERE generated_articles.status = 'READY_TO_PUBLISH'
     RETURNING (xmax = 0) AS inserted`,
    [input.siteId, input.externalId, JSON.stringify(input.payload), input.agentNote])
  const row = result.rows[0]
  if (!row) return 'already-decided'
  return row.inserted ? 'inserted' : 'updated'
}
