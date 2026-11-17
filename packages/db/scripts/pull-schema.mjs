// pull-schema.mjs  -  Membuat ulang src/schema/{schema,relations}.ts dari
// database lewat `drizzle-kit pull`.
//
// drizzle-kit pull juga menulis migration.sql + snapshot.json; keduanya
// dibuang karena migration ditulis tangan di migrations/ (ADR-003).
// Jalankan setelah migration baru diterapkan:  pnpm db:migrate && pnpm db:pull
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const pkgDir = fileURLToPath(new URL('..', import.meta.url))
const outDir = fileURLToPath(new URL('../drizzle', import.meta.url)) // sama dengan `out` di drizzle.config.ts
const schemaDir = fileURLToPath(new URL('../src/schema', import.meta.url))

const HEADER = `// =====================================================================
// FILE HASIL GENERATE - jangan diedit tangan.
// Sumber: database setelah migrations/*.sql dijalankan.
// Buat ulang: pnpm db:pull   (packages/db/scripts/pull-schema.mjs)
//
// Schema ini hanya untuk query bertipe. Constraint ditegakkan database;
// mis. ON DELETE SET NULL (kolom) tertulis di sini sebagai "set null" saja.
// =====================================================================
`

rmSync(outDir, { recursive: true, force: true })
const pull = spawnSync('drizzle-kit', ['pull'], { cwd: pkgDir, stdio: 'inherit', shell: process.platform === 'win32' })
if (pull.status !== 0) process.exit(pull.status ?? 1)

mkdirSync(schemaDir, { recursive: true })
for (const file of ['schema.ts', 'relations.ts']) {
  const generated = readFileSync(`${outDir}/${file}`, 'utf8')
  writeFileSync(`${schemaDir}/${file}`, HEADER + generated)
  console.log(`tulis  src/schema/${file}`)
}
rmSync(outDir, { recursive: true, force: true })
