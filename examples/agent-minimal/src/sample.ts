// Artikel contoh TANPA LLM (`--sample`): menyusun payload v1 yang lolos skema
// (docs/kontrak-agent.md), lengkap dengan gambar sampul, agar alur agent ->
// antrian -> approve bisa diuji tanpa API key dan tanpa biaya.
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import type { GenerateOptions, GeneratedArticle } from './article.ts'
import type { SiteContext } from './db.ts'
import { placeholderPng } from './placeholder-png.ts'

const IMAGE_EXT: Record<string, string> = { '.jpg': 'jpg', '.jpeg': 'jpg', '.png': 'png', '.webp': 'webp' }

export async function generateSample(ctx: SiteContext, options: GenerateOptions): Promise<GeneratedArticle> {
  const category = pickCategory(ctx, options.category)
  const stamp = options.now.toISOString().slice(0, 16).replace('T', ' ')
  const slug = `uji-agent-${options.now.toISOString().slice(0, 19).replace(/[^0-9]/g, '')}`

  const cover = await loadCover(options.coverImage)
  const yyyy = String(options.now.getUTCFullYear())
  const mm = String(options.now.getUTCMonth() + 1).padStart(2, '0')
  const coverKey = `${ctx.site.code}/${yyyy}/${mm}/${slug}-cover.${cover.ext}`

  const payload = {
    version: 1,
    title: `[Uji agent] Artikel percobaan ${stamp} UTC`,
    slug,
    excerpt: 'Artikel percobaan dari kerangka agent minimal. Tolak setelah alur dicek.',
    category: category.slug,
    ...(ctx.authors[0] ? { author: ctx.authors[0].slug } : {}),
    tags: ['Uji Agent'],
    cover: 'cover',
    images: [
      {
        key: 'cover',
        storageKey: coverKey,
        altText: 'Gambar sampul percobaan bergradasi biru',
        credit: 'Gambar: dibuat oleh agent',
      },
    ],
    body: {
      version: 2,
      blocks: [
        { type: 'paragraph', text: `Artikel ini ditulis oleh kerangka agent minimal untuk kategori ${category.name}.` },
        { type: 'heading', level: 2, text: 'Yang diuji' },
        {
          type: 'list',
          style: 'bullet',
          items: ['Login sebagai blog_agent', 'Membaca kategori aktif', 'Menyimpan gambar ke storage', 'Menulis hasil ke antrian terbit'],
        },
        { type: 'image', image: 'cover', caption: 'Gambar sampul percobaan' },
        { type: 'link', url: 'https://example.com/', label: 'Contoh tautan', description: 'Block tautan body versi 2' },
      ],
    },
    references: [
      { title: 'Example Domain', url: 'https://example.com/', publisher: 'IANA' },
    ],
    seo: { description: 'Artikel percobaan kerangka agent minimal.' },
  }

  const note = [
    'Mode contoh (--sample): isi tanpa LLM.',
    ctx.rejections.length ? `${ctx.rejections.length} penolakan terakhir dibaca.` : 'Belum ada penolakan.',
  ].join(' ')

  return { slug, payload, agentNote: note, images: [{ storageKey: coverKey, bytes: cover.bytes }] }
}

function pickCategory(ctx: SiteContext, wanted: string | undefined) {
  if (wanted) {
    const found = ctx.categories.find((c) => c.slug === wanted)
    if (!found) throw new Error(`kategori "${wanted}" tidak aktif di ${ctx.site.code}. Pilihan: ${ctx.categories.map((c) => c.slug).join(', ')}`)
    return found
  }
  const first = ctx.categories[0]
  if (!first) throw new Error(`site ${ctx.site.code} belum punya kategori aktif`)
  return first
}

async function loadCover(path: string | undefined): Promise<{ bytes: Uint8Array; ext: string }> {
  if (!path) return { bytes: placeholderPng(), ext: 'png' }
  const ext = IMAGE_EXT[extname(path).toLowerCase()]
  if (!ext) throw new Error(`gambar harus JPEG/PNG/WebP: ${path}`)
  const bytes = new Uint8Array(await readFile(path))
  if (bytes.length > 10 * 1024 * 1024) throw new Error(`gambar lebih dari 10 MB: ${path}`)
  return { bytes, ext }
}
