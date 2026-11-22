// Bentuk hasil yang dikembalikan pembuat konten (Claude atau contoh) ke agent.ts.

export interface GeneratedImage {
  storageKey: string
  bytes: Uint8Array
}

export interface GeneratedArticle {
  slug: string
  /** Payload v1 sesuai docs/kontrak-agent.md. */
  payload: Record<string, unknown>
  agentNote: string
  /** Disimpan ke storage SEBELUM payload ditulis ke database. */
  images: GeneratedImage[]
}

export interface GenerateOptions {
  /** Slug kategori; kosong = model memilih dari kategori aktif. */
  category?: string
  /** Topik atau arahan redaksi; kosong = model memilih topik sendiri. */
  topic?: string
  coverImage?: string
  now: Date
}
