// Entry ./manifest setiap template dipakai server (Nitro) untuk
// menyelesaikan theme dan layout sebelum view model dibangun (ADR-008).
// Nitro tidak bisa memuat .vue atau .css, jadi entry itu, beserta semua
// yang di-import-nya (relatif maupun paket @framework/* lain), tidak boleh
// sampai ke file .vue/.css. Test ini menelusuri import secara statis.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repo = new URL('..', import.meta.url).pathname

/** Paket workspace: nama -> { dir, exports }. */
const packages = new Map<string, { dir: string; exports: Record<string, string> }>()
for (const group of ['packages', 'templates']) {
  for (const entry of readdirSync(join(repo, group), { withFileTypes: true })) {
    const file = join(repo, group, entry.name, 'package.json')
    if (!entry.isDirectory() || !existsSync(file)) continue
    const pkg = JSON.parse(readFileSync(file, 'utf8')) as { name: string; exports?: Record<string, string> }
    packages.set(pkg.name, { dir: join(repo, group, entry.name), exports: pkg.exports ?? {} })
  }
}

/** Specifier import di file .ts (statis, re-export, import() dinamis, side-effect). Import tipe diabaikan. */
function importsOf(code: string): string[] {
  const clean = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const out: string[] = []
  for (const m of clean.matchAll(/^\s*(import|export)\s+(type\s+)?([^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm)) {
    if (!m[2]) out.push(m[4] as string)
  }
  for (const m of clean.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1] as string)
  return out
}

function resolveImport(from: string, spec: string): string | null {
  if (spec.startsWith('.')) {
    const base = resolve(dirname(from), spec)
    if (/\.(ts|vue|css)$/.test(base)) return base
    if (existsSync(`${base}.ts`)) return `${base}.ts`
    if (existsSync(join(base, 'index.ts'))) return join(base, 'index.ts')
    throw new Error(`${relative(repo, from)}: import ${spec} tidak ditemukan`)
  }
  const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0] ?? spec
  const pkg = packages.get(name)
  if (!pkg) return null // paket luar (zod, vue untuk tipe): bukan bagian yang ditelusuri
  // '@framework/template-base' -> '.', '@framework/template-base/manifest' -> './manifest'
  const target = pkg.exports[`.${spec.slice(name.length)}`]
  if (!target) throw new Error(`${spec}: subpath tidak diekspor ${name}`)
  return join(pkg.dir, target)
}

/** Semua file yang terjangkau dari entry; berhenti di file .vue/.css (dilaporkan). */
function reachable(entry: string): { files: string[]; forbidden: string[] } {
  const seen = new Set<string>()
  const forbidden: string[] = []
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop() as string
    if (seen.has(file)) continue
    seen.add(file)
    if (/\.(vue|css)$/.test(file)) {
      forbidden.push(relative(repo, file))
      continue
    }
    for (const spec of importsOf(readFileSync(file, 'utf8'))) {
      const target = resolveImport(file, spec)
      if (target) queue.push(target)
    }
  }
  return { files: [...seen].map((f) => relative(repo, f)), forbidden }
}

const templates = [...packages.entries()].filter(([, pkg]) => relative(repo, pkg.dir).startsWith('templates/'))

describe('entry ./manifest template (ADR-008)', () => {
  it.each(templates.filter(([, pkg]) => pkg.exports['.']))('%s punya entry ./manifest', (_name, pkg) => {
    expect(pkg.exports['./manifest']).toBeDefined()
  })

  it.each(templates.filter(([, pkg]) => pkg.exports['./manifest']))('%s/manifest tidak menjangkau .vue atau .css', (_name, pkg) => {
    const { files, forbidden } = reachable(join(pkg.dir, pkg.exports['./manifest'] as string))
    expect(files.length).toBeGreaterThan(0)
    expect(forbidden).toEqual([])
  })

  it('penelusur menangkap .vue/.css lewat import tidak langsung (kontrol)', () => {
    const base = packages.get('@framework/template-base')
    if (!base) throw new Error('template-base tidak ditemukan')
    const { forbidden } = reachable(join(base.dir, base.exports['.'] as string))
    expect(forbidden).toEqual(expect.arrayContaining(['templates/base/src/styles/base.css', 'templates/base/src/sections/HeroSection.vue']))
  })
})
