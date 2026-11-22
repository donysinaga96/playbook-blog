// Aritmetika desimal untuk uang tanpa float (ADR-011). Nilai dibawa sebagai
// string desimal kanonik ('-1234.5'), dihitung sebagai bigint berskala.
// Pembulatan: half away from zero, sama dengan round() numeric PostgreSQL.

const DECIMAL = /^([+-])?(\d+)(?:\.(\d+))?$/

export class DecimalError extends Error {
  override name = 'DecimalError'
}

/**
 * Angka dari API/JSON/teks -> string desimal kanonik. Number diterima bila
 * hingga (1.154, 2e-7); string harus berbentuk desimal biasa dengan titik.
 */
export function toDecimal(value: string | number | bigint): string {
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new DecimalError(`bukan angka hingga: ${value}`)
    // toFixed(12) menghindari notasi eksponen; nol di belakang dibuang.
    return canonical(Math.abs(value) < 1e21 ? value.toFixed(12) : BigInt(Math.round(value)).toString())
  }
  const text = value.trim()
  if (!DECIMAL.test(text)) throw new DecimalError(`format angka tidak valid: "${value}"`)
  return canonical(text)
}

function canonical(text: string): string {
  const m = DECIMAL.exec(text)
  if (!m) throw new DecimalError(`format angka tidak valid: "${text}"`)
  const int = (m[2] ?? '0').replace(/^0+(?=\d)/, '')
  const frac = (m[3] ?? '').replace(/0+$/, '')
  const body = frac ? `${int}.${frac}` : int
  return m[1] === '-' && /[1-9]/.test(body) ? `-${body}` : body
}

/** Desimal -> bigint dengan `scale` digit pecahan; digit lebih dibulatkan half away from zero. */
export function toScaled(value: string, scale: number): bigint {
  const m = DECIMAL.exec(toDecimal(value))
  if (!m) throw new DecimalError(`format angka tidak valid: "${value}"`)
  const negative = m[1] === '-'
  const frac = m[3] ?? ''
  const digits = BigInt(`${m[2]}${frac.padEnd(scale, '0').slice(0, scale)}`)
  const rest = frac.slice(scale)
  const roundUp = rest.length > 0 && Number(rest[0]) >= 5
  const magnitude = roundUp ? digits + 1n : digits
  return negative ? -magnitude : magnitude
}

/** bigint berskala -> string desimal dengan tepat `scale` digit pecahan. */
export function fromScaled(value: bigint, scale: number): string {
  const negative = value < 0n
  const digits = (negative ? -value : value).toString().padStart(scale + 1, '0')
  const int = digits.slice(0, digits.length - scale)
  const frac = scale > 0 ? `.${digits.slice(digits.length - scale)}` : ''
  return `${negative && /[1-9]/.test(digits) ? '-' : ''}${int}${frac}`
}

/** a x b, dibulatkan ke `scale` digit (half away from zero). */
export function multiply(a: string, b: string, scale: number): string {
  const [ma, sa] = split(a)
  const [mb, sb] = split(b)
  const product = ma * mb
  const productScale = sa + sb
  if (productScale <= scale) return fromScaled(product * 10n ** BigInt(scale - productScale), scale)
  const divisor = 10n ** BigInt(productScale - scale)
  const negative = product < 0n
  const abs = negative ? -product : product
  let q = abs / divisor
  if ((abs % divisor) * 2n >= divisor) q += 1n
  return fromScaled(negative ? -q : q, scale)
}

/** Jumlah beberapa desimal, hasil dengan `scale` digit. */
export function sum(values: string[], scale: number): string {
  return fromScaled(values.reduce((acc, v) => acc + toScaled(v, scale), 0n), scale)
}

/** Perbandingan nilai (bukan teks): '1.50' sama dengan '1.5'. */
export function compareDecimal(a: string, b: string): -1 | 0 | 1 {
  const [ma, sa] = split(a)
  const [mb, sb] = split(b)
  const scale = Math.max(sa, sb)
  const x = ma * 10n ** BigInt(scale - sa)
  const y = mb * 10n ** BigInt(scale - sb)
  return x < y ? -1 : x > y ? 1 : 0
}

export function negate(value: string): string {
  const d = toDecimal(value)
  return d.startsWith('-') ? d.slice(1) : d === '0' ? d : `-${d}`
}

function split(value: string): [bigint, number] {
  const d = toDecimal(value)
  const frac = d.split('.')[1] ?? ''
  return [BigInt(d.replace('.', '')), frac.length]
}

/**
 * Teks angka dari file impor -> desimal kanonik. `decimalSeparator` ','
 * untuk format Indonesia/Eropa ('1.234.567,89'), '.' untuk '1,234,567.89'.
 * Simbol mata uang, spasi, dan tanda kurung akuntansi '(12.50)' diterima.
 */
export function parseAmountText(raw: string, decimalSeparator: '.' | ','): string {
  let text = raw.trim()
  let negative = false
  if (/^\(.*\)$/.test(text)) {
    negative = true
    text = text.slice(1, -1)
  }
  text = text.replace(/[\s\u00a0]/g, '').replace(/^[A-Za-z$€£¥₹]*?(?=[-+\d])/u, '').replace(/[A-Za-z$€£¥₹]+$/u, '')
  if (text.startsWith('-')) {
    negative = !negative
    text = text.slice(1)
  } else if (text.startsWith('+')) {
    text = text.slice(1)
  }
  const thousands = decimalSeparator === ',' ? '.' : ','
  // '12.50' di file berformat koma (atau '12,50' di file berformat titik)
  // hampir pasti salah pilih pemisah: ditolak agar angka tidak meleset 100x.
  const wrongSeparator = decimalSeparator === ',' ? /^\d+\.\d{1,2}$/ : /^\d+,\d{1,2}$/
  if (wrongSeparator.test(text)) {
    throw new DecimalError(`"${raw}" ambigu: periksa pilihan pemisah desimal`)
  }
  text = text.split(thousands).join('')
  if (decimalSeparator === ',') text = text.replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(text)) throw new DecimalError(`"${raw}" bukan angka`)
  return toDecimal(negative ? `-${text}` : text)
}
