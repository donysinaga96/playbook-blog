// Agent minimal: koneksi -> baca konteks site -> buat artikel -> simpan
// gambar -> tulis hasil ke generated_articles (antrian terbit).
//   node --env-file=.env src/agent.ts [--sample] [--dry-run]
// --sample : artikel contoh tanpa LLM (tanpa API key, tanpa biaya).
// --dry-run: tidak menulis apa pun; cetak payload saja. Tanpa --sample tetap
//            memanggil Claude (berbayar).
import pg from 'pg'
import { loadContext, upsertGenerated } from './db.ts'
import { generateArticle } from './generate.ts'
import { generateSample } from './sample.ts'
import { assertStorageKey, localDirStorage } from './storage.ts'

function env(name: string, required = true): string | undefined {
  const value = process.env[name]?.trim()
  if (required && !value) throw new Error(`${name} belum diisi (lihat .env.example)`)
  return value || undefined
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const sample = process.argv.includes('--sample')
  if (!sample) env('ANTHROPIC_API_KEY')
  const now = new Date()
  const siteCode = env('AGENT_SITE_CODE')!
  const runId = env('AGENT_RUN_ID', false) ?? `run-${now.toISOString().slice(0, 10)}`
  const storage = localDirStorage(env('AGENT_MEDIA_DIR')!)

  const db = new pg.Client({ connectionString: env('AGENT_DATABASE_URL'), application_name: 'blog-agent-minimal' })
  await db.connect()
  try {
    const ctx = await loadContext(db, siteCode)
    console.log(`site ${ctx.site.code} (${ctx.site.name}): ${ctx.categories.length} kategori aktif, ${ctx.authors.length} penulis, ${ctx.tags.length} tag`)
    for (const r of ctx.rejections) console.log(`  ditolak ${r.externalId}: ${r.reviewNote}`)

    const options = {
      category: env('AGENT_CATEGORY', false),
      topic: env('AGENT_TOPIC', false),
      coverImage: env('AGENT_COVER_IMAGE', false),
      now,
    }
    if (!sample) console.log('menulis dengan Claude (riset + tulis + tinjau), biasanya beberapa menit...')
    const article = sample ? await generateSample(ctx, options) : await generateArticle(ctx, options)
    const externalId = `${runId}/${article.slug}`
    for (const image of article.images) assertStorageKey(image.storageKey, ctx.site.code)

    if (dryRun) {
      console.log(`[dry-run] external_id ${externalId}`)
      console.log(JSON.stringify(article.payload, null, 2))
      return
    }

    // Urutan penting: file gambar harus sudah ada sebelum admin meng-approve.
    for (const image of article.images) {
      await storage.put(image.storageKey, image.bytes)
      console.log(`gambar  ${image.storageKey} (${image.bytes.length} byte)`)
    }

    const result = await upsertGenerated(db, {
      siteId: ctx.site.id,
      externalId,
      payload: article.payload,
      agentNote: article.agentNote,
    })
    const label = { inserted: 'baru', updated: 'diperbarui', 'already-decided': 'tidak diubah (sudah diputuskan admin)' }[result]
    console.log(`hasil   ${externalId}: ${label}`)
    console.log('Buka Antrian terbit di admin untuk meninjau.')
  } finally {
    await db.end()
  }
}

main().catch((error: unknown) => {
  console.error(`agent gagal: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
