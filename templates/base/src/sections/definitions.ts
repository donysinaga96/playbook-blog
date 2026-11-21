// Definisi section base (ADR-008): skema props + data yang dibutuhkan.
// Bebas Vue/CSS karena di-import entry ./manifest yang dipakai server.
// Komponennya ada di ./components.ts dengan key yang sama.
//
// Props dari site_themes.layouts; field yang tidak diisi memakai default.
// Batas limit per section diulang di template-kit dan core
// (SECTION_LIMITS.maxArticles = 12).
import { defineSection, z } from '@framework/template-kit'

// title/description (meta) menjadi label form layout di admin (M4 4.4).
const limit = (fallback: number, max = 12) => z.number().int().min(1).max(max).default(fallback).meta({ title: 'Jumlah artikel' })
/** Judul pengganti; tanpa judul = judul bawaan komponen. */
const title = z.string().trim().min(1).max(80).optional().meta({ title: 'Judul section', description: 'Kosong: judul bawaan' })
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug huruf kecil, angka, tanda hubung').meta({ title: 'Slug kategori' })
const SOURCE_META = { title: 'Sumber artikel', description: 'latest = terbaru, featured = pilihan redaksi' }

export const baseSections = {
  /** Artikel utama berukuran besar di puncak halaman. */
  hero: defineSection({
    props: z.object({
      source: z.enum(['featured', 'latest']).default('featured').meta(SOURCE_META),
      limit: limit(1, 3),
    }).meta({ title: 'Artikel utama' }),
    data: ({ source, limit }) => ({ source, limit }),
  }),

  /** Grid kartu artikel terbaru. */
  'latest-grid': defineSection({
    props: z.object({ title, limit: limit(6) }).meta({ title: 'Grid terbaru' }),
    data: ({ limit }) => ({ source: 'latest', limit }),
  }),

  /** Daftar judul ringkas tanpa gambar. */
  'headline-list': defineSection({
    props: z.object({
      title,
      source: z.enum(['latest', 'featured']).default('latest').meta(SOURCE_META),
      limit: limit(5),
    }).meta({ title: 'Daftar judul' }),
    data: ({ source, limit }) => ({ source, limit }),
  }),

  /** Deret kartu dari satu kategori (termasuk sub-kategorinya), dengan tautan ke kategori. */
  'category-strip': defineSection({
    props: z.object({ title, categorySlug: slug, limit: limit(4) }).meta({ title: 'Strip kategori' }),
    data: ({ categorySlug, limit }) => ({ source: 'category', slug: categorySlug, limit }),
  }),
}

export type BaseSectionType = keyof typeof baseSections
