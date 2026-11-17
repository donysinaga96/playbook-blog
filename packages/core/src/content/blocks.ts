// Block body v1: isi artikel dan halaman disimpan sebagai
//   { "version": 1, "blocks": [ ... ] }
// di kolom JSONB articles.body / pages.body. Database hanya menjaga bentuk
// luarnya (CHECK articles_body_shape); isi tiap block divalidasi di sini.
//
// Aturan:
//  - Teks selalu polos (bukan HTML), jadi aman dari XSS dan bisa dirender
//    berbeda oleh tiap template.
//  - Block baru atau perubahan bentuk block = naikkan BODY_VERSION dan
//    tulis migrasi data; jangan mengubah bentuk block v1 diam-diam.
//  - Tipe block yang tidak dikenal TIDAK boleh disimpan (schema ketat),
//    tetapi saat dirender dilewati dan dicatat (parseBodyLenient).
import { z } from 'zod'

export const BODY_VERSION = 1

const text = z.string().trim().min(1).max(20_000)
const shortText = z.string().trim().min(1).max(1_000)
const httpsUrl = z.url({ protocol: /^https$/ }).max(2_048)

export const paragraphBlock = z.strictObject({
  type: z.literal('paragraph'),
  text,
})

export const headingBlock = z.strictObject({
  type: z.literal('heading'),
  // Level 1 dipakai judul artikel oleh template, jadi isi mulai dari 2.
  level: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  text: shortText,
})

export const imageBlock = z.strictObject({
  type: z.literal('image'),
  // Harus media milik site yang sama; dicek di service saat menyimpan.
  mediaId: z.uuid(),
  caption: shortText.optional(),
})

export const quoteBlock = z.strictObject({
  type: z.literal('quote'),
  text,
  cite: shortText.optional(),
})

export const listBlock = z.strictObject({
  type: z.literal('list'),
  style: z.enum(['bullet', 'numbered']),
  items: z.array(shortText).min(1).max(200),
})

// Embed dibatasi ke penyedia yang dikenal dan URL https; template
// membangun iframe sendiri dari provider + url, tidak menerima HTML.
export const embedBlock = z.strictObject({
  type: z.literal('embed'),
  provider: z.enum(['youtube', 'vimeo', 'x']),
  url: httpsUrl,
})

export const blockSchema = z.discriminatedUnion('type', [
  paragraphBlock,
  headingBlock,
  imageBlock,
  quoteBlock,
  listBlock,
  embedBlock,
])

export const bodySchema = z.strictObject({
  version: z.literal(BODY_VERSION),
  blocks: z.array(blockSchema).max(2_000),
})

export type Block = z.infer<typeof blockSchema>
export type BlockType = Block['type']
export type Body = z.infer<typeof bodySchema>

export const BLOCK_TYPES = blockSchema.options.map((o) => o.shape.type.value) satisfies BlockType[]

/** Body kosong yang sama dengan default kolom di database. */
export const emptyBody = (): Body => ({ version: BODY_VERSION, blocks: [] })

/** Validasi ketat untuk menyimpan: melempar ZodError bila ada yang salah. */
export function parseBody(raw: unknown): Body {
  return bodySchema.parse(raw)
}

export interface LenientBody {
  body: Body
  /** Block yang dilewati: tipe tidak dikenal atau bentuk tidak valid. */
  skipped: { index: number; type: string | null; reason: string }[]
}

/**
 * Untuk MEMBACA saat render: block yang tidak dikenal atau rusak dilewati
 * dan dilaporkan, tidak membuat halaman crash. Bentuk luar (object dengan
 * array blocks) tetap wajib; bila rusak, body dianggap kosong.
 */
export function parseBodyLenient(raw: unknown): LenientBody {
  const outer = z.looseObject({ version: z.number(), blocks: z.array(z.unknown()) }).safeParse(raw)
  if (!outer.success) {
    return { body: emptyBody(), skipped: [{ index: -1, type: null, reason: 'bentuk body tidak valid' }] }
  }

  const blocks: Block[] = []
  const skipped: LenientBody['skipped'] = []
  outer.data.blocks.forEach((candidate, index) => {
    const parsed = blockSchema.safeParse(candidate)
    if (parsed.success) {
      blocks.push(parsed.data)
      return
    }
    const type = z.object({ type: z.string() }).safeParse(candidate)
    const known = type.success && (BLOCK_TYPES as string[]).includes(type.data.type)
    skipped.push({
      index,
      type: type.success ? type.data.type : null,
      reason: known ? 'isi block tidak valid' : 'tipe block tidak dikenal',
    })
  })
  return { body: { version: BODY_VERSION, blocks }, skipped }
}
