// Membangun docs/tutorial.md dari docs/tutorial/tutorial.tpl.md.
//
// Template berisi teks bab dan penanda satu baris:
//   @@include path/dari/root/repo bahasa@@
// yang diganti dengan nama file dan isi file TERBARU dari repo dalam blok
// kode. Jadi blok kode di tutorial selalu sama dengan kode sebenarnya:
// cukup jalankan ulang setelah kode berubah.
//
//   pnpm tutorial          tulis ulang docs/tutorial.md
//   pnpm tutorial --check  gagal (exit 1) bila docs/tutorial.md belum diperbarui
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../../', import.meta.url)
const templatePath = new URL('tutorial.tpl.md', import.meta.url)
const outputPath = new URL('docs/tutorial.md', root)

const INCLUDE = /^@@include (\S+)(?: (\S+))?@@$/gm

const template = readFileSync(templatePath, 'utf8')
const output = template.replace(INCLUDE, (_match, path, lang = '') => {
  let body
  try {
    body = readFileSync(new URL(path, root), 'utf8').replace(/\n+$/, '')
  } catch {
    throw new Error(`@@include ${path}: file tidak ada (${fileURLToPath(new URL(path, root))})`)
  }
  // Pagar 4 backtick bila isi file sendiri memuat ``` (mis. file Markdown).
  const fence = body.includes('```') ? '````' : '```'
  return `\`${path}\`\n\n${fence}${lang}\n${body}\n${fence}`
})

if (process.argv.includes('--check')) {
  let current = ''
  try {
    current = readFileSync(outputPath, 'utf8')
  } catch {
    // belum ada: dianggap belum diperbarui
  }
  if (current !== output) {
    console.error('docs/tutorial.md belum diperbarui. Jalankan: pnpm tutorial')
    process.exit(1)
  }
  console.log('docs/tutorial.md sudah sesuai template dan kode.')
} else {
  writeFileSync(outputPath, output)
  console.log(`docs/tutorial.md: ${output.split('\n').length} baris`)
}
