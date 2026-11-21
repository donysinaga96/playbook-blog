// Konten contoh untuk melihat sejauh mana site menampilkan satu artikel
// lengkap: satu resep saksang di site dapur-nusantara yang memakai semua
// yang didukung konten saat ini (lihat daftar di bawah). Hanya untuk
// database DEV; bukan bagian seed, karena snapshot dan test database
// memakai data seed apa adanya.
//
//   pnpm --filter @framework/web demo:saksang            pasang (ulang)
//   pnpm --filter @framework/web demo:saksang --remove   hapus semuanya
//
// Selama konten ini terpasang, test database lokal (snapshot, daftar
// artikel kuliner) berbeda dari seed dan bisa gagal; hapus dulu sebelum
// `pnpm check`.
//
// Yang dipakai:
//   artikel   kategori bertingkat (Kuliner Daerah > Sumatera), penulis dengan
//             bio + avatar, gambar utama (titik fokus, keterangan, kredit),
//             excerpt, featured, tanggal terbit + diperbarui, tag (lama + baru),
//             SEO (judul, deskripsi, gambar OG), attributes resep, revisi 1
//   body      paragraph, heading 2/3/4, image x2, quote + cite, list bullet
//             dan numbered, embed youtube/vimeo/x
//   site      item menu footer ke artikel, redirect dari URL lama
//
// URL embed di bawah adalah CONTOH (bukan video saksang sungguhan); ganti
// dengan tautan nyata bila ada. File gambar tidak ada di repo: di dev,
// route /media menampilkan placeholder bernama file.
import { parseArgs } from 'node:util'
import { bodySchema, extractBodyText } from '@framework/core'
import {
  articleRevisions,
  articles,
  articleTags,
  authors,
  createDatabase,
  databaseUrlFromEnv,
  eq,
  inArray,
  media,
  menuItems,
  redirects,
  tags,
} from '@framework/db'

const SITE = '01930000-0000-7000-8000-000000000102' // dapur-nusantara
const CATEGORY_SUMATERA = '01930000-0000-7000-8000-000000000413'
const TAG_PEDAS = '01930000-0000-7000-8000-000000000511'
const TAG_TRADISIONAL = '01930000-0000-7000-8000-000000000512'
const MENU_FOOTER = '01930000-0000-7000-8000-000000000812'
const ADMIN_USER = '01930000-0000-7000-8000-000000000001'

// Id tetap (awalan ...d0..) agar skrip bisa dijalankan ulang dan dihapus bersih.
const ID = {
  article: '01930000-0000-7000-8000-0000000d0001',
  author: '01930000-0000-7000-8000-0000000d0002',
  tagBatak: '01930000-0000-7000-8000-0000000d0003',
  mediaCover: '01930000-0000-7000-8000-0000000d0011',
  mediaAndaliman: '01930000-0000-7000-8000-0000000d0012',
  mediaBumbu: '01930000-0000-7000-8000-0000000d0013',
  mediaOg: '01930000-0000-7000-8000-0000000d0014',
  mediaAvatar: '01930000-0000-7000-8000-0000000d0015',
  menuItem: '01930000-0000-7000-8000-0000000d0021',
  redirect: '01930000-0000-7000-8000-0000000d0031',
}
const MEDIA_IDS = [ID.mediaCover, ID.mediaAndaliman, ID.mediaBumbu, ID.mediaOg, ID.mediaAvatar]

const body = bodySchema.parse({
  version: 1,
  blocks: [
    {
      type: 'paragraph',
      text: 'Saksang adalah masakan daging cincang berbumbu dari tanah Batak, Sumatera Utara. Hidangan ini hampir selalu hadir di pesta adat, dari pernikahan sampai syukuran, dan biasanya disajikan bersama nasi hangat serta daun ubi tumbuk.',
    },
    {
      type: 'paragraph',
      text: 'Ciri khasnya ada pada andaliman, rempah yang membuat lidah sedikit kebas dan meninggalkan aroma jeruk yang segar. Versi tradisional dimasak bersama darah segar sehingga kuahnya kental dan berwarna gelap; versi tanpa darah juga umum dan tetap lezat.',
    },
    { type: 'heading', level: 2, text: 'Bahan' },
    {
      type: 'list',
      style: 'bullet',
      items: [
        '1 kg daging babi bagian samcan, potong dadu kecil',
        '200 ml darah babi segar, aduk dengan 1 sdt garam agar tidak menggumpal (boleh dilewati)',
        '2 sdm andaliman, sangrai sebentar lalu tumbuk kasar',
        '3 batang serai, memarkan',
        '5 lembar daun jeruk',
        '3 lembar daun salam',
        '4 sdm kelapa parut sangrai, tumbuk halus',
        '300 ml air',
        'Garam secukupnya',
      ],
    },
    { type: 'heading', level: 3, text: 'Bumbu halus' },
    {
      type: 'list',
      style: 'bullet',
      items: [
        '10 butir bawang merah',
        '6 siung bawang putih',
        '10 buah cabai merah keriting',
        '5 buah cabai rawit, sesuai selera',
        '5 cm lengkuas',
        '4 cm jahe',
        '3 cm kunyit',
        '4 butir kemiri sangrai',
      ],
    },
    { type: 'image', mediaId: ID.mediaAndaliman, caption: 'Andaliman yang baru disangrai: tumbuk kasar agar aromanya keluar.' },
    { type: 'heading', level: 2, text: 'Cara memasak' },
    {
      type: 'list',
      style: 'numbered',
      items: [
        'Tumis bumbu halus dengan sedikit minyak hingga harum dan matang, sekitar 5 menit.',
        'Masukkan serai, daun jeruk, dan daun salam; aduk sampai layu.',
        'Masukkan daging, aduk hingga berubah warna dan bumbu meresap.',
        'Tuang air, tutup, lalu masak dengan api kecil 45 menit sampai daging empuk.',
        'Tambahkan kelapa sangrai dan andaliman, aduk rata.',
        'Kecilkan api, tuang darah sedikit demi sedikit sambil terus diaduk sampai kuah mengental dan berwarna gelap, sekitar 10 menit.',
        'Koreksi rasa dengan garam, angkat, dan sajikan selagi hangat.',
      ],
    },
    { type: 'image', mediaId: ID.mediaBumbu, caption: 'Bumbu halus ditumis sampai benar-benar matang sebelum daging masuk.' },
    {
      type: 'quote',
      text: 'Saksang yang enak tidak boleh terburu-buru. Darah dimasukkan paling akhir, apinya kecil, dan tangan jangan berhenti mengaduk.',
      cite: 'Pesan turun-temurun di dapur keluarga Batak',
    },
    { type: 'heading', level: 3, text: 'Tips agar tidak menggumpal' },
    {
      type: 'paragraph',
      text: 'Darah yang dicampur garam sejak awal tidak cepat menggumpal. Masukkan pada api kecil dan aduk terus; api besar membuat darah pecah dan teksturnya berpasir.',
    },
    { type: 'heading', level: 4, text: 'Tanpa darah' },
    {
      type: 'paragraph',
      text: 'Lewati langkah keenam, lalu tambah dua sendok makan kelapa sangrai agar kuah tetap kental. Rasanya lebih ringan, tetapi andaliman tetap menjadi bintangnya.',
    },
    { type: 'heading', level: 2, text: 'Video dan referensi' },
    { type: 'paragraph', text: 'Tonton cara mengaduk darah tanpa menggumpal, lalu bandingkan dengan versi tanpa darah.' },
    { type: 'embed', provider: 'youtube', url: 'https://www.youtube.com/watch?v=CONTOHSAKSA' },
    { type: 'embed', provider: 'vimeo', url: 'https://vimeo.com/999999999999' },
    { type: 'embed', provider: 'x', url: 'https://x.com/dapurnusantara/status/1000000000000000000' },
    {
      type: 'paragraph',
      text: 'Sajikan saksang dengan nasi putih, daun ubi tumbuk, dan sambal andaliman. Simpan sisa di kulkas paling lama dua hari, lalu panaskan dengan api kecil.',
    },
  ],
})

const { values } = parseArgs({ options: { remove: { type: 'boolean', default: false } } })
const db = createDatabase({ connectionString: databaseUrlFromEnv(), max: 1, applicationName: 'demo-saksang' })

async function remove(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) {
  await tx.delete(menuItems).where(eq(menuItems.id, ID.menuItem))
  await tx.delete(redirects).where(eq(redirects.id, ID.redirect))
  await tx.delete(articles).where(eq(articles.id, ID.article)) // article_tags dan revisi ikut terhapus (CASCADE)
  await tx.delete(authors).where(eq(authors.id, ID.author))
  await tx.delete(tags).where(eq(tags.id, ID.tagBatak))
  await tx.delete(media).where(inArray(media.id, MEDIA_IDS))
}

try {
  await db.transaction(async (tx) => {
    await remove(tx)
    if (values.remove) return

    const day = 24 * 60 * 60 * 1000
    const publishedAt = new Date(Date.now() - 2 * day)
    const updatedAt = new Date()

    await tx.insert(media).values([
      { id: ID.mediaCover, siteId: SITE, storageKey: 'dapur-nusantara/2026/11/saksang.webp', mimeType: 'image/webp', sizeBytes: 228_000, width: 1600, height: 1067, altText: 'Saksang berkuah gelap di piring tanah liat, ditaburi andaliman', caption: 'Saksang dengan kuah darah yang kental.', credit: 'Foto: Redaksi Dapur', focalX: 0.42, focalY: 0.58 },
      { id: ID.mediaAndaliman, siteId: SITE, storageKey: 'dapur-nusantara/2026/11/andaliman.webp', mimeType: 'image/webp', sizeBytes: 96_000, width: 1200, height: 800, altText: 'Butiran andaliman hijau di cobek batu', credit: 'Foto: Redaksi Dapur' },
      { id: ID.mediaBumbu, siteId: SITE, storageKey: 'dapur-nusantara/2026/11/bumbu-saksang.webp', mimeType: 'image/webp', sizeBytes: 104_000, width: 1200, height: 900, altText: 'Bumbu halus merah ditumis di wajan', credit: 'Foto: Redaksi Dapur' },
      { id: ID.mediaOg, siteId: SITE, storageKey: 'dapur-nusantara/2026/11/saksang-og.webp', mimeType: 'image/webp', sizeBytes: 140_000, width: 1200, height: 630, altText: 'Saksang khas Batak' },
      { id: ID.mediaAvatar, siteId: SITE, storageKey: 'dapur-nusantara/penulis/maria-sitompul.webp', mimeType: 'image/webp', sizeBytes: 24_000, width: 400, height: 400, altText: 'Maria Sitompul' },
    ])

    await tx.insert(authors).values({
      id: ID.author,
      siteId: SITE,
      name: 'Maria Sitompul',
      slug: 'maria-sitompul',
      bio: 'Penulis resep dari Balige. Menulis masakan Batak sehari-hari dan hidangan pesta adat.',
      avatarMediaId: ID.mediaAvatar,
      links: { instagram: 'https://instagram.com/contoh.penulis' },
    })

    await tx.insert(tags).values({ id: ID.tagBatak, siteId: SITE, name: 'Batak', slug: 'batak' })

    const article = {
      id: ID.article,
      siteId: SITE,
      categoryId: CATEGORY_SUMATERA,
      authorId: ID.author,
      featuredMediaId: ID.mediaCover,
      title: 'Saksang khas Batak: daging berbumbu andaliman yang wajib di pesta adat',
      slug: 'saksang-khas-batak',
      excerpt: 'Resep saksang rumahan dengan andaliman dan darah segar, lengkap dengan versi tanpa darah dan tips agar kuah tidak menggumpal.',
      body,
      bodyText: extractBodyText(body),
      format: 'STANDARD',
      status: 'PUBLISHED',
      isFeatured: true,
      publishedAt,
      seo: {
        title: 'Resep Saksang Khas Batak dengan Andaliman',
        description: 'Cara membuat saksang khas Batak: bahan, bumbu halus, langkah memasak, dan tips agar darah tidak menggumpal.',
        og_image_id: ID.mediaOg,
      },
      attributes: { recipe: { prepMinutes: 30, cookMinutes: 60, servings: 6, spiceLevel: 'pedas' } },
      createdBy: ADMIN_USER,
      updatedBy: ADMIN_USER,
      createdAt: publishedAt,
      updatedAt,
    }
    await tx.insert(articles).values(article)
    await tx.insert(articleTags).values([
      { siteId: SITE, articleId: ID.article, tagId: ID.tagBatak, sortOrder: 0 },
      { siteId: SITE, articleId: ID.article, tagId: TAG_TRADISIONAL, sortOrder: 1 },
      { siteId: SITE, articleId: ID.article, tagId: TAG_PEDAS, sortOrder: 2 },
    ])
    await tx.insert(articleRevisions).values({
      siteId: SITE,
      articleId: ID.article,
      revisionNo: 1,
      snapshot: {
        title: article.title, slug: article.slug, excerpt: article.excerpt, body, category_id: article.categoryId,
        author_id: article.authorId, featured_media_id: article.featuredMediaId, format: article.format,
        seo: article.seo, attributes: article.attributes, tag_ids: [ID.tagBatak, TAG_TRADISIONAL, TAG_PEDAS],
      },
      changeNote: 'Konten contoh (demo:saksang)',
      createdBy: ADMIN_USER,
    })

    await tx.insert(menuItems).values({
      id: ID.menuItem, siteId: SITE, menuId: MENU_FOOTER, label: 'Resep saksang', itemType: 'ARTICLE', articleId: ID.article, sortOrder: 2,
    })
    await tx.insert(redirects).values({
      id: ID.redirect, siteId: SITE, fromPath: '/resep/saksang-babi', toPath: '/sumatera/saksang-khas-batak', statusCode: 301,
    })
  })
  console.log(values.remove ? '[demo] konten saksang dihapus' : '[demo] konten saksang terpasang: http://kuliner.localhost:3000/sumatera/saksang-khas-batak')
} finally {
  await db.$client.end()
}
