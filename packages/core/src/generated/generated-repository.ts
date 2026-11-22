// Repository hasil AI (ADR-010, M5a 5a.2): antrian, pemeriksaan, approve,
// tolak. Agent menulis generated_articles langsung ke database; repository
// ini hanya dipakai admin.
//
//  - review: menjalankan skema payload dan pemeriksaan yang butuh database
//    atau storage. Galat memblokir approve; peringatan hanya ditampilkan.
//  - approve: satu transaksi. Baris hasil AI dikunci (FOR UPDATE), diperiksa
//    ulang, lalu media, tag baru, artikel, dan referensi dibuat lewat aturan
//    yang sama dengan editor (createArticle), dan hasil AI ditandai APPROVED.
//    Klik ganda atau dua admin bersamaan: yang kedua melihat status APPROVED.
//  - reject: alasan wajib, status ARCHIVED.
//  - approve dan reject membawa updatedAt yang dilihat admin: bila agent
//    memperbarui hasil itu sesudahnya, keputusan ditolak (conflict), agar
//    yang terbit selalu versi yang sudah diperiksa.
// Hasil yang sudah diputuskan tidak bisa diubah (trigger generated_articles_guard).
import {
  and,
  articles,
  authors,
  categories,
  count,
  desc,
  eq,
  generatedArticles,
  inArray,
  media,
  sites,
  sql,
  tags,
} from '@framework/db'
import type { Block } from '../content/blocks'
import { embedSrc } from '../content/embed'
import type { ArticleRecord, EditorRepository, Tx } from '../editor/editor-repository'
import type { ArticleDetail } from '../repositories/content-repository'
import type { MediaRef } from '../repositories/types'
import { conflict, EditorError, invalid, notFound } from '../editor/errors'
import { updatedAtSchema } from '../editor/inputs'
import { isReservedFirstSegment, permalinkFirstToken, slugify } from '../editor/slug'
import { sniffImage } from '../media/image-info'
import type { MediaStorage } from '../media/local-storage'
import { normalizePaging, toPage, type Page, type RepositoryContext, type SiteId } from '../repositories/types'
import { parseSiteSettings } from '../site/settings'
import { parseGeneratedPayload, type GeneratedImage, type GeneratedPayload, type GeneratedStatus } from './payload'

type Db = RepositoryContext['db'] | Tx

export interface ReviewIssue {
  level: 'error' | 'warning'
  /** Lokasi di payload, mis. "category", "images.0.storageKey". Kosong = keseluruhan. */
  field: string
  message: string
}

export interface GeneratedListItem {
  id: string
  siteId: string
  externalId: string
  status: GeneratedStatus
  /** Judul dari payload; null bila payload tidak punya judul berupa teks. */
  title: string | null
  agentNote: string | null
  generatedAt: Date
  reviewedAt: Date | null
  articleId: string | null
  /** Token versi: berubah setiap agent memperbarui hasil ini. */
  updatedAt: Date
}

export interface GeneratedRecord extends GeneratedListItem {
  payload: unknown
  reviewNote: string | null
  reviewedBy: string | null
}

/** Gambar setelah diperiksa: media yang sudah ada di site, atau file baru yang dicatat saat approve. */
export type ResolvedImage =
  | { kind: 'existing'; mediaId: string; image: GeneratedImage }
  | { kind: 'new'; image: GeneratedImage; mimeType: string; sizeBytes: number; width: number; height: number }

export interface ResolvedPlan {
  payload: GeneratedPayload
  categoryId: string
  authorId: string | null
  /** Tag per slug: id yang sudah ada, atau null = dibuat saat approve. */
  tags: { name: string; slug: string; id: string | null }[]
  images: Map<string, ResolvedImage>
}

export interface GeneratedReview {
  record: GeneratedRecord
  issues: ReviewIssue[]
  /** Tidak ada galat dan status masih READY_TO_PUBLISH. */
  canApprove: boolean
  /** Hasil resolusi bila payload lolos skema (dipakai pratinjau); null bila tidak. */
  plan: ResolvedPlan | null
}

export type ApproveMode = 'publish' | 'schedule' | 'draft'

export interface ApproveInput {
  /** updatedAt hasil AI yang ditampilkan saat memutuskan (ISO). Berbeda = agent sudah memperbaruinya -> conflict. */
  expectedUpdatedAt: string
  /** publish = terbit sekarang; schedule = terbit pada publishAt; draft = artikel DRAFT untuk diedit. */
  mode: ApproveMode
  /** ISO 8601 dengan zona waktu; wajib untuk schedule dan harus di masa depan. */
  publishAt?: string
  note?: string
}

/** Artikel sintetis dari hasil AI untuk dirender pembangun halaman publik (pratinjau). */
export interface GeneratedPreview {
  article: ArticleDetail
  /** Media untuk gambar di artikel itu; file baru memakai id sementara. */
  media: MediaRef[]
}

export interface ApproveResult {
  article: ArticleRecord
  generated: GeneratedRecord
}

/** Penyimpanan yang dibaca saat memeriksa gambar. null = storage belum diatur di server. */
export type ImageReader = Pick<MediaStorage, 'read'> | null

const EXTENSION_MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
const NOTE_MAX = 1_000

const recordColumns = {
  id: generatedArticles.id,
  siteId: generatedArticles.siteId,
  externalId: generatedArticles.externalId,
  status: generatedArticles.status,
  title: sql<string | null>`CASE WHEN jsonb_typeof(${generatedArticles.payload}->'title') = 'string' THEN ${generatedArticles.payload}->>'title' END`,
  agentNote: generatedArticles.agentNote,
  generatedAt: generatedArticles.generatedAt,
  reviewedAt: generatedArticles.reviewedAt,
  articleId: generatedArticles.articleId,
  updatedAt: generatedArticles.updatedAt,
}

export function createGeneratedRepository(ctx: RepositoryContext, editor: EditorRepository) {
  const { db } = ctx

  async function loadRecord(tx: Db, siteId: SiteId, id: string, lock = false): Promise<GeneratedRecord> {
    if (!UUID.test(id)) throw notFound('Hasil AI')
    const query = tx
      .select({ ...recordColumns, payload: generatedArticles.payload, reviewNote: generatedArticles.reviewNote, reviewedBy: generatedArticles.reviewedBy })
      .from(generatedArticles)
      .where(and(eq(generatedArticles.siteId, siteId), eq(generatedArticles.id, id)))
      .limit(1)
    const [row] = await (lock ? query.for('update') : query)
    if (!row) throw notFound('Hasil AI')
    return { ...row, status: row.status as GeneratedStatus }
  }

  /** Pemeriksaan yang butuh database dan storage; payload sudah lolos skema. */
  async function resolvePlan(tx: Db, siteId: SiteId, payload: GeneratedPayload, storage: ImageReader): Promise<{ issues: ReviewIssue[]; plan: ResolvedPlan | null }> {
    const issues: ReviewIssue[] = []
    const error = (field: string, message: string) => issues.push({ level: 'error', field, message })
    const warning = (field: string, message: string) => issues.push({ level: 'warning', field, message })

    const [site] = await tx.select({ code: sites.code, settings: sites.settings }).from(sites).where(eq(sites.id, siteId)).limit(1)
    if (!site) throw notFound('Site')

    // Kategori: wajib ada dan aktif. Tidak dibuat otomatis (memengaruhi menu dan URL).
    const [category] = await tx.select({ id: categories.id, status: categories.status }).from(categories)
      .where(and(eq(categories.siteId, siteId), eq(categories.slug, payload.category))).limit(1)
    if (!category) error('category', `kategori "${payload.category}" tidak ada di site ini`)
    else if (category.status !== 'ACTIVE') error('category', `kategori "${payload.category}" tidak aktif`)

    let authorId: string | null = null
    if (payload.author) {
      const [author] = await tx.select({ id: authors.id, status: authors.status }).from(authors)
        .where(and(eq(authors.siteId, siteId), eq(authors.slug, payload.author))).limit(1)
      if (!author) error('author', `penulis "${payload.author}" tidak ada di site ini`)
      else if (author.status !== 'ACTIVE') error('author', `penulis "${payload.author}" tidak aktif`)
      else authorId = author.id
    }

    // Tag: yang belum ada dibuat saat approve (peringatan).
    const wanted = payload.tags.map((name) => ({ name, slug: slugify(name) }))
    const existing = wanted.length
      ? await tx.select({ id: tags.id, slug: tags.slug }).from(tags).where(and(eq(tags.siteId, siteId), inArray(tags.slug, wanted.map((t) => t.slug))))
      : []
    const tagIds = new Map(existing.map((t) => [t.slug, t.id]))
    const resolvedTags = wanted.map((t) => ({ ...t, id: tagIds.get(t.slug) ?? null }))
    const newTags = resolvedTags.filter((t) => !t.id).map((t) => t.name)
    if (newTags.length) warning('tags', `tag baru akan dibuat: ${newTags.join(', ')}`)

    // Slug yang diminta: belum dipakai artikel site ini dan bukan route sistem.
    // Redirect lama dengan path yang sama tidak masalah: konten menang atas redirect.
    if (payload.slug) {
      const [taken] = await tx.select({ id: articles.id }).from(articles).where(and(eq(articles.siteId, siteId), eq(articles.slug, payload.slug))).limit(1)
      if (taken) error('slug', `slug "${payload.slug}" sudah dipakai artikel lain`)
      const settings = parseSiteSettings(site.settings)
      if (permalinkFirstToken(settings.permalink) === ':slug' && isReservedFirstSegment(payload.slug)) error('slug', `"${payload.slug}" dipakai route sistem`)
    }

    // Gambar: diawali kode site; sudah tercatat di site ini = dipakai ulang;
    // tercatat di site lain = galat; belum tercatat = file harus ada dan gambar sah.
    const images = new Map<string, ResolvedImage>()
    const keys = payload.images.map((i) => i.storageKey)
    const known = keys.length
      ? await tx.select({ id: media.id, siteId: media.siteId, storageKey: media.storageKey }).from(media).where(inArray(media.storageKey, keys))
      : []
    const knownByKey = new Map(known.map((m) => [m.storageKey, m]))
    for (const [i, image] of payload.images.entries()) {
      const field = `images.${i}.storageKey`
      if (!image.storageKey.startsWith(`${site.code}/`)) {
        error(field, `storageKey harus diawali "${site.code}/"`)
        continue
      }
      if (!image.credit && !image.sourceUrl) warning(`images.${i}`, `gambar "${image.key}" tanpa kredit atau sourceUrl`)
      const row = knownByKey.get(image.storageKey)
      if (row) {
        if (row.siteId !== siteId) error(field, 'file ini sudah tercatat sebagai media site lain')
        else images.set(image.key, { kind: 'existing', mediaId: row.id, image })
        continue
      }
      if (!storage) {
        error(field, 'storage media belum diatur di server (MEDIA_DIR)')
        continue
      }
      const bytes = await storage.read(image.storageKey)
      if (!bytes) {
        error(field, `file ${image.storageKey} tidak ada di storage`)
        continue
      }
      const info = sniffImage(bytes)
      if (!info) {
        error(field, 'file bukan gambar JPEG, PNG, atau WebP yang sah')
        continue
      }
      const extension = image.storageKey.split('.').pop()?.toLowerCase() ?? ''
      if (EXTENSION_MIME[extension] !== info.mimeType) {
        error(field, `ekstensi .${extension} tidak sesuai isi file (${info.mimeType})`)
        continue
      }
      images.set(image.key, { kind: 'new', image, mimeType: info.mimeType, sizeBytes: bytes.length, width: info.width, height: info.height })
    }

    // Embed: provider harus bisa membangun alamat pemutar dari URL-nya.
    const referenceUrls = new Set(payload.references.map((r) => r.url))
    for (const [i, block] of payload.body.blocks.entries()) {
      if (block.type !== 'embed') continue
      if (!embedSrc(block.provider, block.url)) error(`body.blocks.${i}.url`, `URL ${block.provider} tidak dikenali: ${block.url}`)
      else if (!referenceUrls.has(block.url)) warning(`body.blocks.${i}.url`, 'video tidak tercantum di referensi (tautan ke sumbernya tetap tampil)')
    }
    if (payload.references.length === 0) warning('references', 'tidak ada referensi sama sekali')

    const hasError = issues.some((i) => i.level === 'error')
    return {
      issues,
      plan: hasError || !category ? null : { payload, categoryId: category.id, authorId, tags: resolvedTags, images },
    }
  }

  async function reviewIn(tx: Db, record: GeneratedRecord, storage: ImageReader): Promise<GeneratedReview> {
    const issues: ReviewIssue[] = []
    if (record.status !== 'READY_TO_PUBLISH') {
      issues.push({ level: 'error', field: '', message: `hasil AI ini sudah diputuskan (${record.status})` })
    }
    const parsed = parseGeneratedPayload(record.payload)
    if (!parsed.ok) {
      issues.push(...parsed.issues.map((i) => ({ level: 'error' as const, field: i.path, message: i.message })))
      return { record, issues, canApprove: false, plan: null }
    }
    const resolved = await resolvePlan(tx, record.siteId, parsed.payload, storage)
    issues.push(...resolved.issues)
    const canApprove = !issues.some((i) => i.level === 'error')
    return { record, issues, canApprove, plan: canApprove ? resolved.plan : null }
  }

  /** Keputusan harus atas versi yang dilihat admin, bukan versi yang baru ditulis agent. */
  function checkToken(record: GeneratedRecord, token: string) {
    const parsed = updatedAtSchema.safeParse(token)
    if (!parsed.success) throw invalid([{ field: 'expectedUpdatedAt', message: 'token versi hasil AI wajib (updatedAt)' }])
    if (record.updatedAt.getTime() !== new Date(parsed.data).getTime()) {
      throw new EditorError('conflict', 'Hasil AI ini baru saja diperbarui agent; muat ulang dan periksa lagi sebelum memutuskan')
    }
  }

  function parseNote(raw: string | undefined, required: boolean): string | null {
    const note = raw?.trim() ?? ''
    if (required && !note) throw invalid([{ field: 'note', message: 'alasan wajib diisi' }])
    if (note.length > NOTE_MAX) throw invalid([{ field: 'note', message: `Maksimal ${NOTE_MAX} karakter` }])
    return note || null
  }

  /** Status dan tanggal artikel dari pilihan approval. */
  function publication(input: ApproveInput): { status: 'PUBLISHED' | 'DRAFT'; publishedAt: string | null } {
    if (input.mode === 'draft') return { status: 'DRAFT', publishedAt: null }
    if (input.mode === 'publish') return { status: 'PUBLISHED', publishedAt: null } // null = sekarang
    if (input.mode !== 'schedule') throw invalid([{ field: 'mode', message: 'pilihan approval tidak dikenal' }])
    const at = input.publishAt ? new Date(input.publishAt) : null
    if (!at || Number.isNaN(at.getTime()) || !/[zZ]|[+-]\d\d:?\d\d$/.test(input.publishAt ?? '')) {
      throw invalid([{ field: 'publishAt', message: 'tanggal terbit wajib diisi (ISO 8601 dengan zona waktu)' }])
    }
    if (at <= ctx.now()) throw invalid([{ field: 'publishAt', message: 'tanggal terbit harus di masa depan' }])
    return { status: 'PUBLISHED', publishedAt: at.toISOString() }
  }

  /** Block payload -> block body v1: gambar menunjuk media yang baru dicatat atau dipakai ulang. */
  function toBody(payload: GeneratedPayload, mediaIds: Map<string, string>): { version: 1; blocks: Block[] } {
    return {
      version: payload.body.version,
      blocks: payload.body.blocks.map((block): Block => {
        if (block.type !== 'image') return block
        const mediaId = mediaIds.get(block.image)
        if (!mediaId) throw new Error(`gambar ${block.image} belum punya media`)
        return block.caption ? { type: 'image', mediaId, caption: block.caption } : { type: 'image', mediaId }
      }),
    }
  }

  /** Artikel sintetis dari plan yang lolos pemeriksaan; id sementara untuk yang belum ada di database. */
  async function previewOf(siteId: SiteId, plan: ResolvedPlan): Promise<GeneratedPreview> {
    const { payload } = plan
    const [category] = await db.select({ id: categories.id, name: categories.name, slug: categories.slug, parentId: categories.parentId })
      .from(categories).where(and(eq(categories.siteId, siteId), eq(categories.id, plan.categoryId))).limit(1)
    if (!category) throw notFound('Kategori')
    const [parent] = category.parentId
      ? await db.select({ id: categories.id, name: categories.name, slug: categories.slug }).from(categories)
        .where(and(eq(categories.siteId, siteId), eq(categories.id, category.parentId))).limit(1)
      : []
    const [author] = plan.authorId
      ? await db.select({ id: authors.id, name: authors.name, slug: authors.slug }).from(authors)
        .where(and(eq(authors.siteId, siteId), eq(authors.id, plan.authorId))).limit(1)
      : []

    const existingIds = [...plan.images.values()].flatMap((i) => (i.kind === 'existing' ? [i.mediaId] : []))
    const existing = existingIds.length
      ? await db.select({
        id: media.id, storageKey: media.storageKey, mimeType: media.mimeType, width: media.width, height: media.height,
        altText: media.altText, caption: media.caption, credit: media.credit, focalX: media.focalX, focalY: media.focalY,
      }).from(media).where(and(eq(media.siteId, siteId), inArray(media.id, existingIds)))
      : []
    const mediaRefs: MediaRef[] = [...existing]
    const mediaIds = new Map<string, string>()
    for (const [key, resolved] of plan.images) {
      if (resolved.kind === 'existing') {
        mediaIds.set(key, resolved.mediaId)
        continue
      }
      const { image } = resolved
      const ref: MediaRef = {
        id: crypto.randomUUID(), storageKey: image.storageKey, mimeType: resolved.mimeType, width: resolved.width, height: resolved.height,
        altText: image.altText, caption: image.caption ?? null, credit: image.credit ?? null, focalX: image.focalX ?? 0.5, focalY: image.focalY ?? 0.5,
      }
      mediaRefs.push(ref)
      mediaIds.set(key, ref.id)
    }

    const now = ctx.now()
    return {
      article: {
        id: crypto.randomUUID(),
        title: payload.title,
        slug: payload.slug ?? (slugify(payload.title) || 'tanpa-judul'),
        excerpt: payload.excerpt ?? null,
        format: payload.format,
        isFeatured: false,
        publishedAt: now,
        updatedAt: now,
        category: { id: category.id, name: category.name, slug: category.slug },
        categoryParent: parent ?? null,
        author: author ?? null,
        featuredMedia: payload.cover ? (mediaRefs.find((m) => m.id === mediaIds.get(payload.cover as string)) ?? null) : null,
        tags: plan.tags.map((t) => ({ id: t.id ?? crypto.randomUUID(), name: t.name, slug: t.slug })),
        attributes: {},
        body: toBody(payload, mediaIds),
        bodyIssues: [],
        seo: payload.seo,
      },
      media: mediaRefs,
    }
  }

  const api = {
    /** Antrian lintas site milik user, terbaru dulu. siteIds kosong = daftar kosong. */
    async list(siteIds: SiteId[], query: { status?: GeneratedStatus; page?: number; pageSize?: number } = {}): Promise<Page<GeneratedListItem>> {
      const paging = normalizePaging({ page: query.page, pageSize: query.pageSize ?? 20 })
      if (siteIds.length === 0) return toPage([], 0, paging.page, paging.pageSize)
      const where = and(inArray(generatedArticles.siteId, siteIds), eq(generatedArticles.status, query.status ?? 'READY_TO_PUBLISH'))
      const [total] = await db.select({ n: count() }).from(generatedArticles).where(where)
      const rows = await db.select(recordColumns).from(generatedArticles).where(where)
        .orderBy(desc(generatedArticles.generatedAt), desc(generatedArticles.id)).limit(paging.pageSize).offset(paging.offset)
      return toPage(rows.map((r) => ({ ...r, status: r.status as GeneratedStatus })), total?.n ?? 0, paging.page, paging.pageSize)
    },

    /** Jumlah yang menunggu keputusan per site (untuk navigasi admin). */
    async countReady(siteIds: SiteId[]): Promise<Record<string, number>> {
      if (siteIds.length === 0) return {}
      const rows = await db.select({ siteId: generatedArticles.siteId, n: count() }).from(generatedArticles)
        .where(and(inArray(generatedArticles.siteId, siteIds), eq(generatedArticles.status, 'READY_TO_PUBLISH')))
        .groupBy(generatedArticles.siteId)
      return Object.fromEntries(rows.map((r) => [r.siteId, r.n]))
    },

    async get(siteId: SiteId, id: string): Promise<GeneratedRecord> {
      return loadRecord(db, siteId, id)
    },

    /** Pemeriksaan untuk layar approval. Tidak mengubah apa pun. */
    async review(siteId: SiteId, id: string, storage: ImageReader): Promise<GeneratedReview> {
      return reviewIn(db, await loadRecord(db, siteId, id), storage)
    },

    /** Pemeriksaan + artikel sintetis untuk pratinjau (null bila masih ada galat). */
    async preview(siteId: SiteId, id: string, storage: ImageReader): Promise<{ review: GeneratedReview; preview: GeneratedPreview | null }> {
      const review = await reviewIn(db, await loadRecord(db, siteId, id), storage)
      // Hasil yang sudah diputuskan tetap bisa dipratinjau bila payload-nya sah.
      const plan = review.plan ?? (await (async () => {
        const parsed = parseGeneratedPayload(review.record.payload)
        return parsed.ok ? (await resolvePlan(db, siteId, parsed.payload, storage)).plan : null
      })())
      return { review, preview: plan ? await previewOf(siteId, plan) : null }
    },

    /** Pindahkan hasil AI ke tabel konten dalam satu transaksi. Galat pemeriksaan = invalid. */
    async approve(siteId: SiteId, id: string, input: ApproveInput, userId: string | null, storage: ImageReader): Promise<ApproveResult> {
      const note = parseNote(input.note, false)
      const { status, publishedAt } = publication(input)
      return db.transaction(async (tx) => {
        const record = await loadRecord(tx, siteId, id, true)
        if (record.status !== 'READY_TO_PUBLISH') throw conflict('Hasil AI')
        checkToken(record, input.expectedUpdatedAt)
        const review = await reviewIn(tx, record, storage)
        if (!review.canApprove || !review.plan) {
          throw invalid(review.issues.filter((i) => i.level === 'error').map((i) => ({ field: i.field, message: i.message })))
        }
        const { payload, images } = review.plan

        // Media: catat file baru; yang sudah ada dipakai ulang.
        const mediaIds = new Map<string, string>()
        for (const [key, resolved] of images) {
          if (resolved.kind === 'existing') {
            mediaIds.set(key, resolved.mediaId)
            continue
          }
          const { image } = resolved
          const [row] = await tx.insert(media).values({
            siteId, storageKey: image.storageKey, mimeType: resolved.mimeType, sizeBytes: resolved.sizeBytes,
            width: resolved.width, height: resolved.height, altText: image.altText, caption: image.caption ?? null,
            credit: image.credit ?? null, sourceUrl: image.sourceUrl ?? null,
            focalX: image.focalX ?? 0.5, focalY: image.focalY ?? 0.5, createdBy: userId,
          }).onConflictDoNothing().returning({ id: media.id })
          if (!row) throw invalid([{ field: 'images', message: `file ${image.storageKey} baru saja dicatat di tempat lain; periksa lagi` }])
          mediaIds.set(key, row.id)
        }

        // Tag baru, lalu id semua tag sesuai urutan payload.
        const missing = review.plan.tags.filter((t) => !t.id)
        if (missing.length) await tx.insert(tags).values(missing.map((t) => ({ siteId, name: t.name, slug: t.slug }))).onConflictDoNothing()
        const tagRows = review.plan.tags.length
          ? await tx.select({ id: tags.id, slug: tags.slug }).from(tags).where(and(eq(tags.siteId, siteId), inArray(tags.slug, review.plan.tags.map((t) => t.slug))))
          : []
        const tagBySlug = new Map(tagRows.map((t) => [t.slug, t.id]))

        const article = await editor.tx.createArticle(tx, siteId, {
          title: payload.title,
          slug: payload.slug,
          excerpt: payload.excerpt ?? null,
          body: toBody(payload, mediaIds),
          categoryId: review.plan.categoryId,
          authorId: review.plan.authorId,
          featuredMediaId: payload.cover ? (mediaIds.get(payload.cover) ?? null) : null,
          format: payload.format,
          status,
          isFeatured: false,
          publishedAt,
          tagIds: review.plan.tags.map((t) => tagBySlug.get(t.slug)).filter((v): v is string => Boolean(v)),
          seo: payload.seo,
          attributes: {},
          references: payload.references,
        }, userId, `Dari hasil AI ${record.externalId}`)

        await tx.update(generatedArticles)
          .set({ status: 'APPROVED', reviewedBy: userId, reviewedAt: sql`now()`, reviewNote: note, articleId: article.id })
          .where(and(eq(generatedArticles.siteId, siteId), eq(generatedArticles.id, record.id)))
        return { article, generated: await loadRecord(tx, siteId, record.id) }
      })
    },

    /** Tolak: alasan wajib, status ARCHIVED. Hasil yang sudah diputuskan = conflict. */
    async reject(siteId: SiteId, id: string, rawNote: string, expectedUpdatedAt: string, userId: string | null): Promise<GeneratedRecord> {
      const note = parseNote(rawNote, true)
      return db.transaction(async (tx) => {
        const record = await loadRecord(tx, siteId, id, true)
        if (record.status !== 'READY_TO_PUBLISH') throw conflict('Hasil AI')
        checkToken(record, expectedUpdatedAt)
        await tx.update(generatedArticles)
          .set({ status: 'ARCHIVED', reviewedBy: userId, reviewedAt: sql`now()`, reviewNote: note })
          .where(and(eq(generatedArticles.siteId, siteId), eq(generatedArticles.id, record.id)))
        return loadRecord(tx, siteId, record.id)
      })
    },
  }
  return api
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type GeneratedRepository = ReturnType<typeof createGeneratedRepository>
