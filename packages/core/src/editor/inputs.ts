// Input operasi tulis admin (M4), divalidasi Zod di core: lapisan API hanya
// meneruskan body request. Referensi ke data lain (kategori, penulis, media,
// tag, induk) dicek terpisah: harus milik site yang sama.
import { z } from 'zod'
import { bodySchema } from '../content/blocks'
import { contentSeoSchema } from '../content/seo'
import { referenceSchema } from '../generated/payload'
import { SLUG_MAX, SLUG_PATTERN } from './slug'

const id = z.uuid()
/** Slug kosong / tidak diisi = dibuat dari judul atau nama. */
const slug = z
  .string()
  .trim()
  .max(SLUG_MAX)
  .refine((s) => s === '' || SLUG_PATTERN.test(s), 'slug hanya huruf kecil, angka, dan tanda hubung')
  .optional()
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((s) => (s ? s : null))
/** Tanggal ISO 8601 dengan zona waktu (dari form admin, dikonversi di browser). */
const isoDate = z.iso.datetime({ offset: true }).transform((s) => new Date(s))

export const ARTICLE_STATUSES = ['DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED'] as const
export const ARTICLE_FORMATS = ['STANDARD', 'LISTICLE', 'GALLERY', 'VIDEO'] as const
export const PAGE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const

export const articleInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(300),
  slug,
  excerpt: optionalText(1_000),
  body: bodySchema,
  categoryId: id,
  authorId: id.nullish().transform((v) => v ?? null),
  featuredMediaId: id.nullish().transform((v) => v ?? null),
  format: z.enum(ARTICLE_FORMATS).default('STANDARD'),
  status: z.enum(ARTICLE_STATUSES).default('DRAFT'),
  isFeatured: z.boolean().default(false),
  /**
   * Tidak dikirim = tanggal tersimpan dipertahankan; null = dikosongkan
   * (PUBLISHED tanpa tanggal = sekarang); tanggal masa depan = terjadwal.
   */
  publishedAt: isoDate.nullable().optional(),
  tagIds: z.array(id).max(50).default([]),
  seo: contentSeoSchema.default({}),
  attributes: z.record(z.string(), z.unknown()).default({}),
  /** Sumber yang dipakai artikel, tampil di halaman sesuai urutan (ADR-010). */
  references: z
    .array(referenceSchema)
    .max(100)
    .default([])
    .superRefine((refs, ctx) => {
      const seen = new Set<string>()
      refs.forEach((r, i) => {
        if (seen.has(r.url)) ctx.addIssue({ code: 'custom', path: [i, 'url'], message: 'URL referensi dobel' })
        seen.add(r.url)
      })
    }),
})
export type ArticleInput = z.output<typeof articleInputSchema>

export const pageInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(300),
  slug,
  body: bodySchema,
  viewKey: z.string().regex(SLUG_PATTERN, 'view_key huruf kecil, angka, tanda hubung').max(50).default('default'),
  status: z.enum(PAGE_STATUSES).default('DRAFT'),
  /** Sama seperti artikel: tidak dikirim = dipertahankan, null = dikosongkan. */
  publishedAt: isoDate.nullable().optional(),
  seo: contentSeoSchema.default({}),
})
export type PageInput = z.output<typeof pageInputSchema>

export const categoryInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  slug,
  parentId: id.nullish().transform((v) => v ?? null),
  description: optionalText(1_000),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
  seo: contentSeoSchema.default({}),
})
export type CategoryInput = z.output<typeof categoryInputSchema>

export const tagInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  slug,
})
export type TagInput = z.output<typeof tagInputSchema>

export const MENU_ITEM_TYPES = ['CATEGORY', 'ARTICLE', 'PAGE', 'TAG', 'URL', 'ROUTE'] as const

export const menuItemInputSchema = z
  .strictObject({
    label: z.string().trim().min(1).max(120),
    parentId: id.nullish().transform((v) => v ?? null),
    type: z.enum(MENU_ITEM_TYPES),
    /** Id kategori/artikel/halaman/tag untuk tipe yang menunjuk konten. */
    targetId: id.nullish().transform((v) => v ?? null),
    /** URL: https://... ; ROUTE: /path internal. */
    url: z.string().trim().max(2_048).nullish().transform((v) => v || null),
    openInNewTab: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(10_000).default(0),
    isActive: z.boolean().default(true),
  })
  .superRefine((item, ctx) => {
    const needsTarget = item.type !== 'URL' && item.type !== 'ROUTE'
    if (needsTarget && !item.targetId) ctx.addIssue({ code: 'custom', path: ['targetId'], message: `tipe ${item.type} butuh targetId` })
    if (!needsTarget && item.targetId) ctx.addIssue({ code: 'custom', path: ['targetId'], message: `tipe ${item.type} tidak memakai targetId` })
    if (item.type === 'URL' && !/^https?:\/\/\S+$/.test(item.url ?? '')) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: 'URL harus diawali http:// atau https://' })
    }
    if (item.type === 'ROUTE' && !/^\/(?!\/)\S*$/.test(item.url ?? '')) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: 'route internal harus diawali / (bukan //)' })
    }
    if (needsTarget && item.url) ctx.addIssue({ code: 'custom', path: ['url'], message: `tipe ${item.type} tidak memakai url` })
  })
export type MenuItemInput = z.output<typeof menuItemInputSchema>

/**
 * Pengaturan site yang bisa diubah admin: identitas, logo, favicon, dan SEO
 * bawaan. Permalink sengaja tidak ada di sini: mengubahnya mengganti URL
 * semua artikel. Media sosial dan analytics belum dirender template.
 */
export const siteSettingsInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  tagline: optionalText(160),
  logoMediaId: id.nullish().transform((v) => v ?? null),
  faviconMediaId: id.nullish().transform((v) => v ?? null),
  seo: z.strictObject({
    /** Pola judul halaman; %s diganti judul konten, mis. "%s | Berita Konoha". */
    titleTemplate: optionalText(120).refine((t) => t === null || t.includes('%s'), 'harus memuat %s'),
    defaultDescription: optionalText(320),
    defaultOgImageId: id.nullish().transform((v) => v ?? null),
  }),
})
export type SiteSettingsInput = z.output<typeof siteSettingsInputSchema>

/** Keterangan media yang bisa diubah admin (file-nya sendiri tidak bisa diganti). */
export const mediaMetaSchema = z.strictObject({
  /** Wajib: dibacakan pembaca layar dan tampil bila gambar gagal dimuat. */
  altText: z.string().trim().min(1).max(500),
  caption: optionalText(1_000),
  credit: optionalText(300),
  /** Halaman asal gambar bila diambil dari sumber lain (ADR-010). */
  sourceUrl: z
    .string()
    .trim()
    .max(2_048)
    .refine((v) => v === '' || /^https?:\/\/\S+$/.test(v), 'URL harus diawali http:// atau https://')
    .nullish()
    .transform((v) => v || null),
  /** Titik fokus 0..1 dari kiri dan atas, dipakai saat gambar dipotong. */
  focalX: z.number().min(0).max(1).default(0.5),
  focalY: z.number().min(0).max(1).default(0.5),
})
export type MediaMetaInput = z.output<typeof mediaMetaSchema>

/** Token konkurensi: versi artikel, atau updatedAt (ISO) untuk tabel tanpa kolom versi. */
export const versionSchema = z.number().int().positive()
export const updatedAtSchema = z.iso.datetime({ offset: true })
