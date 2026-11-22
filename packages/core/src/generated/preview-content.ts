// Repository konten untuk pratinjau hasil AI (ADR-010, M5a 5a.3): sama
// dengan repository konten biasa, kecuali artikel sintetis dari hasil AI
// ikut "terbit" di slug-nya, dan media sementaranya bisa dibaca. Dengan
// begitu pratinjau dirender pembangun halaman dan template yang sama
// persis dengan halaman publik, tanpa menulis apa pun ke database.
import type { ContentRepository } from '../repositories/content-repository'
import type { SiteId } from '../repositories/types'
import type { GeneratedPreview } from './generated-repository'

export function withPreviewArticle(content: ContentRepository, siteId: SiteId, preview: GeneratedPreview): ContentRepository {
  const extra = new Map(preview.media.map((m) => [m.id, m]))
  return {
    ...content,
    async getPublishedArticle(site, slug) {
      if (site === siteId && slug === preview.article.slug) return preview.article
      return content.getPublishedArticle(site, slug)
    },
    async getMediaByIds(site, ids) {
      if (site !== siteId) return content.getMediaByIds(site, ids)
      const known = ids.filter((id) => extra.has(id))
      const rest = await content.getMediaByIds(site, ids.filter((id) => !extra.has(id)))
      return [...known.map((id) => extra.get(id)!), ...rest]
    },
  }
}
