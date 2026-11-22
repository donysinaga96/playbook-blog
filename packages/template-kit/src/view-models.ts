// View model: data siap tampil yang dibangun core dan diterima template.
//
// Ini KONTRAK PUBLIK (ADR-005). Menambah field aman; menghapus atau mengganti
// nama field = versi mayor template-kit.
//
// Aturan bentuk:
//  - Semua URL sudah jadi (href). Template tidak pernah menyusun URL sendiri,
//    jadi pola permalink cukup diketahui core.
//  - Tanggal sudah diformat sesuai locale dan timezone site (DateView).
//  - Teks selalu polos, bukan HTML.
//  - Hanya tipe data JSON (string, number, boolean, null, array, object),
//    supaya bisa dikirim dari server ke browser apa adanya.

/** Gambar siap pakai untuk SmartImage. */
export interface ImageView {
  src: string
  alt: string
  /** Ukuran asli; null bila tidak diketahui (mis. SVG tanpa dimensi). */
  width: number | null
  height: number | null
  /** Titik fokus 0..1 dari kiri dan dari atas; dipakai saat gambar dipotong. */
  focalX: number
  focalY: number
  caption: string | null
  credit: string | null
  /** Halaman asal gambar bila diambil dari sumber lain (ADR-010). */
  sourceUrl: string | null
}

/** Satu sumber yang dipakai artikel (ADR-010), tampil sesuai urutan. */
export interface ReferenceView {
  title: string
  url: string
  publisher: string | null
  kind: 'ARTICLE' | 'VIDEO' | 'IMAGE' | 'OTHER'
}

export interface DateView {
  /** ISO 8601, untuk atribut datetime. */
  iso: string
  /** Sudah diformat sesuai locale dan timezone site, mis. "17 November 2026". */
  label: string
}

export interface LinkView {
  label: string
  href: string
}

export interface MenuItemView {
  label: string
  href: string
  /** Tujuan di luar site; template boleh menambah rel/ikon. */
  external: boolean
  openInNewTab: boolean
  children: MenuItemView[]
}

export interface SiteView {
  name: string
  tagline: string | null
  /** Bahasa dokumen, mis. "id". */
  locale: string
  logo: ImageView | null
  homeHref: string
}

/** Bagian halaman yang sama untuk semua view: identitas site, menu, tanggal. */
export interface ChromeView {
  site: SiteView
  /** Menu per lokasi (header, footer, ...). Lokasi tanpa menu = array kosong. */
  menus: Record<string, MenuItemView[]>
  today: DateView
}

export interface ArticleCardView {
  href: string
  title: string
  excerpt: string | null
  category: LinkView
  author: LinkView | null
  publishedAt: DateView
  image: ImageView | null
  isFeatured: boolean
  /** Format artikel (standard, review, ...); template boleh memberi gaya berbeda. */
  format: string
}

export interface PaginationView {
  page: number
  totalPages: number
  prevHref: string | null
  nextHref: string | null
  /** Nomor halaman yang ditampilkan; null = celah ("…"). */
  pages: ({ number: number; href: string; current: boolean } | null)[]
}

// ---------- Block body (isi artikel dan halaman) ------------------------

export type BlockView =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: 2 | 3 | 4; text: string }
  | { type: 'image'; image: ImageView; caption: string | null }
  | { type: 'quote'; text: string; cite: string | null }
  | { type: 'list'; style: 'bullet' | 'numbered'; items: string[] }
  | {
      type: 'embed'
      provider: 'youtube' | 'vimeo' | 'x'
      /** URL asli, untuk tautan cadangan. */
      url: string
      /** URL iframe yang aman (dibangun core); null = tampilkan tautan saja. */
      embedSrc: string | null
    }
  | {
      type: 'link'
      /** http(s) atau mailto, sudah divalidasi core. */
      url: string
      label: string
      description: string | null
      /** email = mailto; web = situs lain (dibuka di tab baru). */
      kind: 'web' | 'email'
    }

export type BlockViewType = BlockView['type']

// ---------- View per jenis halaman --------------------------------------

/**
 * Satu section halaman (ADR-008), dirender komponen section di base
 * berdasarkan `type`.
 */
export interface SectionView {
  /** Tipe section dari manifest base, mis. 'hero', 'latest-grid'. */
  type: string
  /** Props tervalidasi skema section (mis. judul pengganti). */
  props: Record<string, unknown>
  articles: ArticleCardView[]
  /** Kategori atau tag yang ditampilkan section, untuk judul dan tautan "lihat semua"; null untuk sumber latest/featured. */
  link: LinkView | null
}

export interface HomeView {
  view: 'home'
  /**
   * Halaman 1 dengan layout section: diisi, dan featured + latest kosong.
   * Halaman 2 dst. (dan site tanpa section): kosong, featured + latest diisi.
   */
  sections: SectionView[]
  featured: ArticleCardView[]
  latest: ArticleCardView[]
  /** Selalu pagination daftar terbaru, juga di halaman 1 dengan section. */
  pagination: PaginationView
}

export interface ArticleView {
  view: 'article'
  breadcrumb: LinkView[]
  title: string
  excerpt: string | null
  category: LinkView
  author: LinkView | null
  publishedAt: DateView
  /** Null bila tidak pernah diubah setelah terbit. */
  updatedAt: DateView | null
  image: ImageView | null
  tags: LinkView[]
  blocks: BlockView[]
  format: string
  /** Sumber dan referensi; kosong = bagian itu tidak ditampilkan. */
  references: ReferenceView[]
}

export interface PageView {
  view: 'page'
  title: string
  /** Varian tampilan halaman, mis. 'default', 'contact'. */
  viewKey: string
  blocks: BlockView[]
}

export interface CategoryView {
  view: 'category'
  breadcrumb: LinkView[]
  name: string
  description: string | null
  children: LinkView[]
  articles: ArticleCardView[]
  pagination: PaginationView
}

export interface TagView {
  view: 'tag'
  name: string
  articles: ArticleCardView[]
  pagination: PaginationView
}

export interface AuthorView {
  view: 'author'
  name: string
  bio: string | null
  avatar: ImageView | null
  articles: ArticleCardView[]
  pagination: PaginationView
}

export interface SearchView {
  view: 'search'
  /** URL tujuan form pencarian (GET, parameter q). */
  action: string
  /** Kata kunci yang sudah dibersihkan; '' bila belum mencari. */
  query: string
  articles: ArticleCardView[]
  pagination: PaginationView
}

export interface NotFoundView {
  view: 'not-found'
  /** Path yang diminta, untuk ditampilkan. */
  path: string
}

export type PageViewModel =
  | HomeView
  | ArticleView
  | PageView
  | CategoryView
  | TagView
  | AuthorView
  | SearchView
  | NotFoundView

export type ViewName = PageViewModel['view']

export const VIEW_NAMES = [
  'home',
  'article',
  'page',
  'category',
  'tag',
  'author',
  'search',
  'not-found',
] as const satisfies readonly ViewName[]

/** View model untuk satu jenis halaman, mis. ViewModelOf<'article'>. */
export type ViewModelOf<V extends ViewName> = Extract<PageViewModel, { view: V }>
