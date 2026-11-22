// View model contoh untuk test render template. Bentuknya mengikuti kontrak
// template-kit; isinya sengaja memuat kasus sulit (teks berisi HTML, menu
// bersarang, pagination dengan celah).
import type {
  ArticleCardView,
  ChromeView,
  ImageView,
  PageViewModel,
  PaginationView,
  ViewName,
  ViewModelOf,
} from '@framework/template-kit'

export const image: ImageView = {
  src: '/media/kabar-tekno/2026/11/hp.webp',
  alt: 'Ponsel lipat di atas meja',
  width: 1600,
  height: 900,
  focalX: 0.62,
  focalY: 0.4,
  caption: 'Ponsel lipat generasi ketiga',
  credit: 'Redaksi',
  sourceUrl: null,
}

const date = { iso: '2026-11-17T03:00:00.000Z', label: '17 November 2026' }

export const chrome: ChromeView = {
  site: { name: 'Kabar Tekno', tagline: 'Teknologi tanpa jargon', locale: 'id', logo: null, homeHref: '/' },
  menus: {
    header: [
      { label: 'Gadget', href: '/gadget', external: false, openInNewTab: false, children: [
        { label: 'Ponsel', href: '/gadget/ponsel', external: false, openInNewTab: false, children: [] },
      ] },
      { label: 'Komunitas', href: 'https://forum.example.com', external: true, openInNewTab: true, children: [] },
    ],
    footer: [{ label: 'Tentang', href: '/p/tentang', external: false, openInNewTab: false, children: [] }],
  },
  today: { iso: '2026-11-19', label: 'Kamis, 19 November 2026' },
}

export const card = (n: number, extra: Partial<ArticleCardView> = {}): ArticleCardView => ({
  href: `/gadget/artikel-${n}`,
  title: `Artikel ${n}`,
  excerpt: `Ringkasan artikel ${n}`,
  category: { label: 'Gadget', href: '/kategori/gadget' },
  author: { label: 'Rina', href: '/penulis/rina' },
  publishedAt: date,
  image: null,
  isFeatured: false,
  format: 'standard',
  ...extra,
})

export const pagination: PaginationView = {
  page: 2,
  totalPages: 9,
  prevHref: '/?page=1',
  nextHref: '/?page=3',
  pages: [
    { number: 1, href: '/?page=1', current: false },
    { number: 2, href: '/?page=2', current: true },
    { number: 3, href: '/?page=3', current: false },
    null,
    { number: 9, href: '/?page=9', current: false },
  ],
}

const noPages: PaginationView = { page: 1, totalPages: 1, prevHref: null, nextHref: null, pages: [] }

export const views: { [V in ViewName]: ViewModelOf<V> } = {
  home: { view: 'home', sections: [], featured: [card(1, { isFeatured: true, image })], latest: [card(2), card(3)], pagination },
  article: {
    view: 'article',
    breadcrumb: [{ label: 'Beranda', href: '/' }, { label: 'Gadget', href: '/kategori/gadget' }, { label: 'Artikel 1', href: '/gadget/artikel-1' }],
    title: 'Ponsel <script>alert(1)</script> lipat',
    excerpt: 'Ringkasan',
    category: { label: 'Gadget', href: '/kategori/gadget' },
    author: { label: 'Rina', href: '/penulis/rina' },
    publishedAt: date,
    updatedAt: null,
    image,
    tags: [{ label: 'Android', href: '/tag/android' }],
    format: 'review',
    references: [
      { title: 'Sumber uji', url: 'https://contoh.test/sumber', publisher: 'Contoh', kind: 'ARTICLE' },
      { title: 'Video uji', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', publisher: null, kind: 'VIDEO' },
    ],
    blocks: [
      { type: 'paragraph', text: 'Paragraf <b>polos</b>.' },
      { type: 'heading', level: 3, text: 'Subjudul' },
      { type: 'image', image, caption: 'Keterangan gambar' },
      { type: 'quote', text: 'Kutipan', cite: 'Narasumber' },
      { type: 'list', style: 'numbered', items: ['Satu', 'Dua'] },
      { type: 'list', style: 'bullet', items: ['Butir'] },
      { type: 'embed', provider: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', embedSrc: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' },
      { type: 'embed', provider: 'x', url: 'https://x.com/a/status/1', embedSrc: null },
    ],
  },
  page: { view: 'page', title: 'Tentang Kami', viewKey: 'default', blocks: [{ type: 'paragraph', text: 'Isi halaman' }] },
  category: {
    view: 'category',
    breadcrumb: [{ label: 'Beranda', href: '/' }, { label: 'Gadget', href: '/kategori/gadget' }],
    name: 'Gadget',
    description: 'Ulasan perangkat',
    children: [{ label: 'Ponsel', href: '/kategori/ponsel' }],
    articles: [card(4)],
    pagination: noPages,
  },
  tag: { view: 'tag', name: 'Android', articles: [], pagination: noPages },
  author: { view: 'author', name: 'Rina', bio: 'Editor gadget', avatar: image, articles: [card(5)], pagination: noPages },
  search: { view: 'search', action: '/cari', query: 'lipat', articles: [card(6)], pagination: noPages },
  'not-found': { view: 'not-found', path: '/tidak-ada' },
}

/** Pastikan fixture mencakup setiap jenis halaman (gagal compile bila ada yang kurang). */
export const allViews: PageViewModel[] = Object.values(views)

/** Home halaman 1 dengan layout section (ADR-008): semua section base + satu tipe tak dikenal. */
export const homeWithSections: ViewModelOf<'home'> = {
  view: 'home',
  sections: [
    { type: 'hero', props: { source: 'featured', limit: 1 }, articles: [card(1, { isFeatured: true, image })], link: null },
    { type: 'latest-grid', props: { limit: 6 }, articles: [card(2), card(3)], link: null },
    { type: 'headline-list', props: { source: 'latest', limit: 5, title: 'Kabar <b>cepat</b>' }, articles: [card(4)], link: null },
    { type: 'category-strip', props: { categorySlug: 'gadget', limit: 4 }, articles: [card(5)], link: { label: 'Gadget', href: '/category/gadget' } },
    { type: 'carousel', props: {}, articles: [card(6)], link: null },
    { type: 'category-strip', props: { categorySlug: 'kosong', limit: 4 }, articles: [], link: { label: 'Kosong', href: '/category/kosong' } },
  ],
  featured: [],
  latest: [],
  pagination,
}
