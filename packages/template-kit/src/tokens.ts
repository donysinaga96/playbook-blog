// Design token -> CSS custom property.
//
//   { color: { primary: '#0f62fe' }, font: { heading: 'Source Sans 3' } }
//   -> --color-primary: #0f62fe;  --font-heading: "Source Sans 3";
//
// Hasilnya disisipkan ke <style> di <head>, jadi nilai dijaga ketat walau
// sudah divalidasi skema manifest: karakter yang bisa menutup deklarasi atau
// blok CSS (; { } < > \ dan baris baru) ditolak.
//
// Konvensi: nilai di grup `font` adalah nama font family dan ditulis
// dengan tanda kutip, karena nama seperti "Source Sans 3" tidak sah tanpa
// kutip. CSS template memakainya dengan fallback:
//   font-family: var(--font-body), system-ui, sans-serif;

export type TokenValue = string | number
export interface TokenTree {
  [key: string]: TokenValue | TokenTree
}

export class TokenError extends Error {
  override name = 'TokenError'
}

const SAFE_VALUE = /^[#a-zA-Z0-9 .,%()+\-/*]+$/
const SAFE_FONT = /^[a-zA-Z0-9 -]+$/
const SAFE_KEY = /^[a-zA-Z][a-zA-Z0-9]*$/

/** camelCase -> kebab-case: lineHeight -> line-height. */
function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}

/** Token bersarang -> pasangan nama variabel dan nilai, urut sesuai urutan key. */
export function tokensToCssVars(tokens: TokenTree): Record<string, string> {
  const vars: Record<string, string> = {}

  function walk(node: TokenTree, path: string[]) {
    for (const [key, value] of Object.entries(node)) {
      if (!SAFE_KEY.test(key)) throw new TokenError(`key token tidak valid: ${[...path, key].join('.')}`)
      const next = [...path, key]
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        walk(value, next)
        continue
      }
      const name = `--${next.map(kebab).join('-')}`
      vars[name] = formatValue(next, value)
    }
  }

  walk(tokens, [])
  return vars
}

function formatValue(path: string[], value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new TokenError(`nilai token ${path.join('.')} harus string atau angka, bukan ${value === null ? 'null' : typeof value}`)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TokenError(`nilai token ${path.join('.')} bukan angka terbatas`)
    return String(value)
  }
  const text = value.trim()
  if (path[0] === 'font') {
    if (!SAFE_FONT.test(text)) throw new TokenError(`nama font tidak valid di ${path.join('.')}: ${JSON.stringify(value)}`)
    return `"${text}"`
  }
  // url(...) ditolak: token tidak boleh memuat sumber eksternal.
  if (!SAFE_VALUE.test(text) || /url\s*\(/i.test(text)) {
    throw new TokenError(`nilai token tidak valid di ${path.join('.')}: ${JSON.stringify(value)}`)
  }
  return text
}

/** Kelas root halaman untuk satu template: .tpl-magazine */
export function templateRootClass(templateKey: string): string {
  return `tpl-${templateKey}`
}

/**
 * Satu aturan CSS yang mendefinisikan variabel di bawah kelas root template,
 * mis. `.tpl-magazine{--color-primary:#0f62fe;...}`. Variabel dibatasi ke
 * kelas root agar tidak bocor ke template lain di mode multi-site.
 */
export function renderTokenCss(templateKey: string, tokens: TokenTree): string {
  const vars = tokensToCssVars(tokens)
  const body = Object.entries(vars).map(([name, value]) => `${name}:${value}`).join(';')
  return `.${templateRootClass(templateKey)}{${body}}`
}
