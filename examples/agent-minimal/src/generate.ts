// Pembuat konten dengan Claude API: riset sumber (web search + web fetch),
// tulis artikel berbahasa Indonesia, tinjau sendiri, lalu kirim lewat tool
// submit_article. Skema tool di bawah mengikuti payload v1
// (docs/kontrak-agent.md); pemeriksaan lengkap tetap terjadi saat approval.
//
// Kredensial: ANTHROPIC_API_KEY (dibaca otomatis oleh SDK). Biaya dihitung
// per token di akun API (Claude Console), terpisah dari langganan claude.ai.
import Anthropic from '@anthropic-ai/sdk'
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import type { GenerateOptions, GeneratedArticle } from './article.ts'
import type { SiteContext } from './db.ts'

const MODEL = process.env['AGENT_MODEL']?.trim() || 'claude-opus-5-5'

// Aturan yang sama dengan skema payload di aplikasi (packages/core).
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const HTTP_URL = /^https?:\/\/\S+$/
const LINK_URL = /^(https?:\/\/\S+|mailto:[^\s@]+@[^\s@]+)$/
const text = (max: number) => z.string().trim().min(1).max(max)

const blockSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('paragraph'), text: text(20_000).describe('Teks polos, bukan HTML atau Markdown') }),
  z.strictObject({ type: z.literal('heading'), level: z.union([z.literal(2), z.literal(3)]), text: text(1_000) }),
  z.strictObject({ type: z.literal('quote'), text: text(20_000), cite: text(1_000).optional().describe('Siapa yang dikutip') }),
  z.strictObject({ type: z.literal('list'), style: z.enum(['bullet', 'numbered']), items: z.array(text(1_000)).min(1).max(50) }),
  z.strictObject({
    type: z.literal('link'),
    url: z.string().regex(LINK_URL, 'http(s) atau mailto, huruf kecil, tanpa spasi').max(2_048),
    label: text(200),
    description: text(500).optional(),
  }).describe('Tautan ke layanan resmi, mis. portal pendaftaran'),
])

function articleSchema(categorySlugs: [string, ...string[]]) {
  return z.strictObject({
    title: text(300),
    slug: z.string().max(120).regex(SLUG, 'huruf kecil, angka, tanda hubung').describe('Dari judul, ringkas'),
    excerpt: text(1_000).describe('Ringkasan 1-2 kalimat'),
    category: z.enum(categorySlugs),
    tags: z.array(text(60)).max(6).describe('Pakai tag yang sudah ada bila cocok'),
    blocks: z.array(blockSchema).min(3).max(200),
    references: z.array(z.strictObject({
      title: text(300),
      url: z.string().regex(HTTP_URL, 'http(s), huruf kecil, tanpa spasi').max(2_048),
      publisher: text(200).optional(),
      kind: z.enum(['ARTICLE', 'VIDEO', 'IMAGE', 'OTHER']),
    })).min(1).max(100).describe('SEMUA sumber yang dipakai untuk menulis isi'),
    seoDescription: text(320),
    agentNote: text(2_000).describe('Untuk redaksi: sumber yang dicek, klaim yang masih diragukan, hal yang perlu diverifikasi manusia'),
  })
}

type Article = z.infer<ReturnType<typeof articleSchema>>

const SYSTEM = `Anda penulis dan editor untuk sebuah situs berita/panduan berbahasa Indonesia.
Pembaca Anda masyarakat umum: tulis dalam bahasa Indonesia baku yang jelas dan mudah diikuti.

Cara kerja:
1. Riset dengan web_search dan web_fetch. Utamakan sumber resmi (situs pemerintah .go.id, lembaga terkait) dan media yang kredibel. Baca halamannya, jangan hanya cuplikan hasil pencarian.
2. Tulis hanya fakta yang ada di sumber. Jangan mengarang angka, tanggal, nama, kutipan, atau prosedur. Bila sumber berbeda pendapat atau informasinya mungkin sudah usang, katakan di artikel dan catat di agentNote.
3. Struktur: paragraf pembuka yang langsung menjawab inti topik, lalu bagian-bagian dengan heading level 2 (level 3 untuk subbagian). Gunakan list untuk langkah atau syarat. Panjang wajar 600-1.200 kata. Judul artikel tidak diulang sebagai heading.
4. Setiap sumber yang Anda pakai masuk ke references, sesuai urutan kemunculannya. Untuk layanan resmi yang perlu dibuka pembaca (mis. portal pendaftaran), tambahkan block link.
5. Sebelum mengirim, tinjau draf Anda sendiri: apakah setiap klaim didukung sumber, apakah kategori tepat, apakah ada informasi yang bisa menyesatkan pembaca. Perbaiki dulu bila perlu.
6. Kirim hasil akhir dengan memanggil submit_article tepat sekali. Bila tool menolak input, perbaiki sesuai pesan dan kirim lagi.`

export async function generateArticle(ctx: SiteContext, options: GenerateOptions): Promise<GeneratedArticle> {
  const categories = options.category
    ? ctx.categories.filter((c) => c.slug === options.category)
    : ctx.categories
  const slugs = categories.map((c) => c.slug)
  if (!slugs.length) {
    throw new Error(options.category
      ? `kategori "${options.category}" tidak aktif di ${ctx.site.code}`
      : `site ${ctx.site.code} belum punya kategori aktif`)
  }
  const schema = articleSchema(slugs as [string, ...string[]])

  const result: { article?: Article } = {}
  const submitArticle = betaZodTool({
    name: 'submit_article',
    description: 'Kirim artikel final yang sudah ditinjau. Panggil tepat sekali, di akhir.',
    inputSchema: schema,
    run: async (input) => {
      result.article = input
      return 'Diterima. Pekerjaan selesai; tidak perlu memanggil tool lagi.'
    },
  })

  const client = new Anthropic()
  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16_000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high' },
    // Bila model utama menolak (classifier keamanan), API mengulang di model
    // cadangan dalam panggilan yang sama.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    tools: [
      { type: 'web_search_20260209', name: 'web_search', max_uses: 8, user_location: { type: 'approximate', country: 'ID', timezone: 'Asia/Jakarta' } },
      { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 10 },
      submitArticle,
    ],
    messages: [{ role: 'user', content: brief(ctx, categories, options) }],
    max_iterations: 8,
  })

  const final = await runner.runUntilDone()
  if (final.stop_reason === 'refusal') {
    throw new Error(`model menolak menulis topik ini (${final.stop_details?.category ?? 'tanpa kategori'})`)
  }
  const article = result.article
  if (!article) throw new Error(`model selesai tanpa memanggil submit_article (stop_reason ${final.stop_reason})`)

  const payload = {
    version: 1,
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt,
    category: article.category,
    ...(ctx.authors[0] ? { author: ctx.authors[0].slug } : {}),
    tags: article.tags,
    body: { version: 2, blocks: article.blocks },
    references: article.references,
    seo: { description: article.seoDescription },
  }
  return {
    slug: article.slug,
    payload,
    agentNote: `${article.agentNote}\n\nModel: ${final.model}.`,
    images: [],
  }
}

function brief(ctx: SiteContext, categories: SiteContext['categories'], options: GenerateOptions): string {
  const lines = [
    `Situs: ${ctx.site.name}. Tanggal hari ini: ${options.now.toISOString().slice(0, 10)}.`,
    options.topic
      ? `Topik dari redaksi: ${options.topic}`
      : 'Pilih sendiri satu topik yang bermanfaat dan masih relevan bagi pembaca situs ini.',
    '',
    'Kategori yang boleh dipakai (slug: nama):',
    ...categories.map((c) => `- ${c.slug}: ${c.name}${c.parentSlug ? ` (sub dari ${c.parentSlug})` : ''}`),
  ]
  if (ctx.tags.length) lines.push('', `Tag yang sudah ada: ${ctx.tags.join(', ')}`)
  if (ctx.recentTitles.length) {
    lines.push('', 'Judul yang sudah pernah dibuat (jangan diulang):', ...ctx.recentTitles.map((t) => `- ${t}`))
  }
  if (ctx.rejections.length) {
    lines.push('', 'Alasan redaksi menolak hasil sebelumnya (hindari kesalahan yang sama):',
      ...ctx.rejections.map((r) => `- ${r.reviewNote}`))
  }
  return lines.join('\n')
}
