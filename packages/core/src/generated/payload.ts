// Payload hasil AI v1 (ADR-010): isi kolom generated_articles.payload yang
// ditulis AI agent di luar repo ini. Kontrak lengkap untuk agent ada di
// docs/kontrak-agent.md; skema di sini adalah sumber kebenarannya.
//
// Bedanya dengan input editor (editor/inputs.ts):
//  - Agent tidak tahu ID internal. Kategori, penulis, dan tag dirujuk lewat
//    slug/nama; gambar lewat `key` lokal di payload yang menunjuk ke
//    `images[]` (storage_key di object storage). ID baru ada saat approve.
//  - Status dan tanggal terbit tidak ada di payload: keduanya keputusan
//    pemilik proyek di layar approval.
//
// Skema ini hanya memeriksa bentuk payload. Pemeriksaan yang butuh database
// atau storage (kategori ada, slug belum dipakai, file gambar ada, storage_key
// diawali kode site) dilakukan saat review/approve (5a.2).
import { z } from 'zod'
import { BODY_VERSION, embedBlock, headingBlock, listBlock, paragraphBlock, quoteBlock } from '../content/blocks'
import { splitStorageKey } from '../media/storage'
import { SLUG_MAX, SLUG_PATTERN, slugify } from '../editor/slug'

export const GENERATED_PAYLOAD_VERSION = 1

/** Status baris generated_articles. Tidak sama dengan status artikel. */
export const GENERATED_STATUSES = ['READY_TO_PUBLISH', 'APPROVED', 'ARCHIVED'] as const
export type GeneratedStatus = (typeof GENERATED_STATUSES)[number]

export const REFERENCE_KINDS = ['ARTICLE', 'VIDEO', 'IMAGE', 'OTHER'] as const
export type ReferenceKind = (typeof REFERENCE_KINDS)[number]

const slug = z.string().trim().max(SLUG_MAX).regex(SLUG_PATTERN, 'slug hanya huruf kecil, angka, dan tanda hubung')
const optionalText = (max: number) => z.string().trim().min(1).max(max).optional()
/** Sumber di luar site boleh http atau https (banyak situs lama masih http). */
const sourceUrl = z.url({ protocol: /^https?$/ }).max(2_048)
/** Kunci gambar di dalam satu payload, mis. "cover" atau "img-2". */
const imageKey = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, 'key gambar: huruf kecil, angka, _ atau -, maks 64')

export const generatedImageSchema = z.strictObject({
  key: imageKey,
  /** Lokasi file di object storage, relatif dan diawali kode site: "kabar-tekno/2026/11/x.webp". */
  storageKey: z.string().max(500).refine((k) => splitStorageKey(k) !== null, 'storageKey tidak sah'),
  altText: z.string().trim().min(1).max(500),
  caption: optionalText(1_000),
  /** Pemilik hak gambar, mis. "Foto: Reuters". */
  credit: optionalText(300),
  /** Halaman asal gambar bila diambil dari sumber lain. */
  sourceUrl: sourceUrl.optional(),
  focalX: z.number().min(0).max(1).optional(),
  focalY: z.number().min(0).max(1).optional(),
})

/** Block gambar di payload: menunjuk `images[].key`, bukan mediaId. */
export const generatedImageBlock = z.strictObject({
  type: z.literal('image'),
  image: imageKey,
  caption: optionalText(1_000),
})

export const generatedBlockSchema = z.discriminatedUnion('type', [
  paragraphBlock,
  headingBlock,
  generatedImageBlock,
  quoteBlock,
  listBlock,
  embedBlock,
])

export const referenceSchema = z.strictObject({
  title: z.string().trim().min(1).max(300),
  url: sourceUrl,
  /** Nama media atau situs, mis. "Kompas", "YouTube - Kanal X". */
  publisher: optionalText(200),
  kind: z.enum(REFERENCE_KINDS).default('ARTICLE'),
})

export const generatedPayloadSchema = z
  .strictObject({
    version: z.literal(GENERATED_PAYLOAD_VERSION),
    title: z.string().trim().min(1).max(300),
    /** Tidak diisi = dibuat dari judul saat approve. */
    slug: slug.optional(),
    excerpt: optionalText(1_000),
    /** Slug kategori yang sudah ada di site. Kategori tidak dibuat otomatis. */
    category: slug,
    /** Slug penulis (tabel authors) di site; tidak diisi = tanpa byline. */
    author: slug.optional(),
    /** Nama tag. Tag yang belum ada dibuat saat approve. */
    tags: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
    format: z.enum(['STANDARD', 'LISTICLE', 'GALLERY', 'VIDEO']).default('STANDARD'),
    /** Key gambar sampul di `images`. */
    cover: imageKey.optional(),
    images: z.array(generatedImageSchema).max(100).default([]),
    body: z.strictObject({
      version: z.literal(BODY_VERSION),
      blocks: z.array(generatedBlockSchema).min(1).max(2_000),
    }),
    references: z.array(referenceSchema).max(100).default([]),
    seo: z
      .strictObject({
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().trim().min(1).max(320).optional(),
      })
      .default({}),
  })
  .superRefine((p, ctx) => {
    const keys = new Set<string>()
    const storageKeys = new Set<string>()
    p.images.forEach((img, i) => {
      if (keys.has(img.key)) ctx.addIssue({ code: 'custom', path: ['images', i, 'key'], message: `key gambar "${img.key}" dipakai dua kali` })
      if (storageKeys.has(img.storageKey)) ctx.addIssue({ code: 'custom', path: ['images', i, 'storageKey'], message: 'storageKey dipakai dua kali' })
      keys.add(img.key)
      storageKeys.add(img.storageKey)
    })
    if (p.cover && !keys.has(p.cover)) ctx.addIssue({ code: 'custom', path: ['cover'], message: `gambar "${p.cover}" tidak ada di images` })
    p.body.blocks.forEach((block, i) => {
      if (block.type === 'image' && !keys.has(block.image)) {
        ctx.addIssue({ code: 'custom', path: ['body', 'blocks', i, 'image'], message: `gambar "${block.image}" tidak ada di images` })
      }
    })
    const tagSlugs = new Set<string>()
    // Tag unik per slug di database, jadi "Masakan Batak" dan "masakan-batak" sama.
    p.tags.forEach((name, i) => {
      const tagSlug = slugify(name)
      if (!tagSlug) ctx.addIssue({ code: 'custom', path: ['tags', i], message: `tag "${name}" tidak bisa dijadikan slug` })
      else if (tagSlugs.has(tagSlug)) ctx.addIssue({ code: 'custom', path: ['tags', i], message: `tag "${name}" dobel` })
      tagSlugs.add(tagSlug)
    })
    const refUrls = new Set<string>()
    p.references.forEach((ref, i) => {
      if (refUrls.has(ref.url)) ctx.addIssue({ code: 'custom', path: ['references', i, 'url'], message: 'URL referensi dobel' })
      refUrls.add(ref.url)
    })
  })

export type GeneratedPayload = z.output<typeof generatedPayloadSchema>
export type GeneratedImage = z.output<typeof generatedImageSchema>
export type GeneratedReference = z.output<typeof referenceSchema>

export interface PayloadIssue {
  /** Lokasi di payload, mis. "body.blocks.3.text". Kosong = payload secara keseluruhan. */
  path: string
  message: string
}

export type PayloadParseResult = { ok: true; payload: GeneratedPayload } | { ok: false; issues: PayloadIssue[] }

/** Validasi payload dari database; tidak melempar, mengembalikan daftar masalah untuk layar approval. */
export function parseGeneratedPayload(raw: unknown): PayloadParseResult {
  const result = generatedPayloadSchema.safeParse(raw)
  if (result.success) return { ok: true, payload: result.data }
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  }
}
