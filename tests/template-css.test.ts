// CSS template tidak boleh bocor ke template lain (ADR-005): di mode
// multi-site semua CSS template dimuat bersama, jadi setiap selector wajib
// diawali kelas root template itu sendiri.
//   templates/base     -> .tpl        (wrapper semua halaman)
//   templates/<key>    -> .tpl-<key>
// File font (@font-face) dikecualikan karena tidak memuat selector.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = new URL('../templates/', import.meta.url).pathname

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : cssFiles(path)
    return entry.name.endsWith('.css') && entry.name !== 'fonts.css' ? [path] : []
  })
}

/** Selector dari teks CSS: bagian sebelum '{' yang bukan at-rule (@media, @supports, ...). */
function selectors(css: string): string[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const result: string[] = []
  for (const match of clean.matchAll(/([^{};]+)\{/g)) {
    const prelude = (match[1] ?? '').trim()
    if (prelude === '' || prelude.startsWith('@')) continue
    result.push(...prelude.split(',').map((s) => s.trim()))
  }
  return result
}

describe('CSS template dibatasi kelas root', () => {
  const files = cssFiles(root)

  it('menemukan CSS base dan magazine', () => {
    const names = files.map((f) => relative(root, f))
    expect(names).toEqual(expect.arrayContaining(['base/src/styles/base.css', 'magazine/src/styles.css']))
  })

  it.each(files.map((f) => [relative(root, f), f]))('%s', (_name, file) => {
    const key = relative(root, file).split('/')[0]
    const prefix = key === 'base' ? '.tpl' : `.tpl-${key}`
    const pattern = new RegExp(`^${prefix.replace('.', '\\.')}(?![\\w-])`)
    const leaking = selectors(readFileSync(file, 'utf8')).filter((s) => !pattern.test(s))
    expect(leaking).toEqual([])
  })

  it('pemeriksa selector menangkap CSS yang bocor', () => {
    expect(selectors('.tpl-magazine a { color: red } body, .x { margin: 0 } @media (min-width: 1px) { .tpl p { x: y } }'))
      .toEqual(['.tpl-magazine a', 'body', '.x', '.tpl p'])
  })
})
