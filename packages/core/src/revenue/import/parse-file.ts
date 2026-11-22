// Parser file impor pendapatan: CSV, Excel (.xlsx), JSON -> tabel teks
// { headers, rows }. Tanpa dependensi tambahan: CSV mengikuti RFC 4180
// (pemisah dideteksi), XLSX dibaca langsung dari zip (zlib) dan XML
// worksheet pertama, JSON berupa array object (atau { items | data | rows }).
//
// Semua nilai dijadikan teks; tafsiran (tanggal, angka) dikerjakan mapping.
import { inflateRawSync } from 'node:zlib'
import { RevenueError } from '../types'

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024
export const MAX_IMPORT_ROWS = 20_000
const MAX_COLUMNS = 100

export type ImportFormat = 'csv' | 'xlsx' | 'json'

export interface ParsedTable {
  format: ImportFormat
  headers: string[]
  rows: Record<string, string>[]
}

export function detectFormat(fileName: string, bytes: Uint8Array): ImportFormat {
  const ext = fileName.toLowerCase().split('.').pop() ?? ''
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    if (ext === 'xls') throw new RevenueError('format .xls lama tidak didukung; simpan ulang sebagai .xlsx atau CSV')
    return 'xlsx'
  }
  if (ext === 'json') return 'json'
  if (ext === 'csv' || ext === 'txt' || ext === 'tsv') return 'csv'
  if (ext === 'xlsx') throw new RevenueError('file .xlsx rusak (bukan arsip zip)')
  const head = new TextDecoder().decode(bytes.slice(0, 64)).trimStart()
  return head.startsWith('[') || head.startsWith('{') ? 'json' : 'csv'
}

export function parseImportFile(fileName: string, bytes: Uint8Array): ParsedTable {
  if (bytes.length === 0) throw new RevenueError('file kosong')
  if (bytes.length > MAX_IMPORT_BYTES) throw new RevenueError(`file lebih dari ${MAX_IMPORT_BYTES / 1024 / 1024} MB`)
  const format = detectFormat(fileName, bytes)
  const table = format === 'xlsx' ? parseXlsx(bytes) : format === 'json' ? parseJsonTable(decodeText(bytes)) : parseCsv(decodeText(bytes))
  if (table.headers.length === 0) throw new RevenueError('tidak ada kolom yang terbaca')
  if (table.rows.length > MAX_IMPORT_ROWS) throw new RevenueError(`lebih dari ${MAX_IMPORT_ROWS} baris; pecah file menjadi beberapa bagian`)
  return { format, ...table }
}

function decodeText(bytes: Uint8Array): string {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/** Nama kolom unik dan tidak kosong ('', 'Amount', 'Amount' -> 'Kolom 1', 'Amount', 'Amount (2)'). */
function uniqueHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>()
  return raw.slice(0, MAX_COLUMNS).map((h, i) => {
    const base = h.trim() || `Kolom ${i + 1}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base} (${n})`
  })
}

function toRows(headers: string[], matrix: string[][]): Record<string, string>[] {
  return matrix
    .filter((cells) => cells.some((c) => c.trim() !== ''))
    .map((cells) => Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? '').trim()])))
}

// ---------- CSV --------------------------------------------------------

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const candidates = [',', ';', '\t', '|']
  let best = ','
  let bestCount = 0
  for (const c of candidates) {
    // Hitung di luar tanda kutip.
    let count = 0
    let quoted = false
    for (const ch of firstLine) {
      if (ch === '"') quoted = !quoted
      else if (ch === c && !quoted) count++
    }
    if (count > bestCount) {
      best = c
      bestCount = count
    }
  }
  return best
}

export function parseCsv(text: string, delimiter = detectDelimiter(text)): { headers: string[]; rows: Record<string, string>[] } {
  const matrix: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"' && field === '') {
      quoted = true
    } else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      matrix.push(row)
      row = []
      field = ''
      if (matrix.length > MAX_IMPORT_ROWS + 1) break
    } else {
      field += ch
    }
  }
  if (quoted) throw new RevenueError('CSV rusak: tanda kutip tidak ditutup')
  if (field !== '' || row.length) {
    row.push(field)
    matrix.push(row)
  }
  const [head, ...body] = matrix
  const headers = uniqueHeaders(head ?? [])
  return { headers, rows: toRows(headers, body) }
}

// ---------- JSON -------------------------------------------------------

export function parseJsonTable(text: string): { headers: string[]; rows: Record<string, string>[] } {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new RevenueError('JSON tidak valid')
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>
    data = obj['items'] ?? obj['data'] ?? obj['rows'] ?? obj['results']
  }
  if (!Array.isArray(data)) throw new RevenueError('JSON harus berupa array object, atau object dengan items/data/rows')
  const objects = data.filter((d): d is Record<string, unknown> => Boolean(d) && typeof d === 'object' && !Array.isArray(d))
  if (objects.length !== data.length) throw new RevenueError('setiap elemen JSON harus object')
  const flat = objects.map((o) => flatten(o))
  const headerSet: string[] = []
  for (const o of flat) for (const k of Object.keys(o)) if (!headerSet.includes(k)) headerSet.push(k)
  const headers = headerSet.slice(0, MAX_COLUMNS)
  return { headers, rows: flat.map((o) => Object.fromEntries(headers.map((h) => [h, o[h] ?? '']))) }
}

/** { a: { b: 1 } } -> { 'a.b': '1' }; array -> teks JSON. */
function flatten(obj: Record<string, unknown>, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  for (const [key, value] of Object.entries(obj)) {
    const name = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value) && prefix.split('.').length < 3) flatten(value as Record<string, unknown>, name, out)
    else out[name] = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
  }
  return out
}

// ---------- XLSX -------------------------------------------------------

interface ZipEntry {
  name: string
  method: number
  compressedSize: number
  localOffset: number
}

/** Daftar entri zip dari central directory. */
function zipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new RevenueError('file .xlsx rusak (zip tanpa central directory)')
  const count = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)
  const entries: ZipEntry[] = []
  for (let n = 0; n < count; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new RevenueError('file .xlsx rusak (central directory)')
    const method = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const nameLen = view.getUint16(offset + 28, true)
    const extraLen = view.getUint16(offset + 30, true)
    const commentLen = view.getUint16(offset + 32, true)
    const localOffset = view.getUint32(offset + 42, true)
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLen))
    entries.push({ name, method, compressedSize, localOffset })
    offset += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

function readZipEntry(bytes: Uint8Array, entry: ZipEntry): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(entry.localOffset, true) !== 0x04034b50) throw new RevenueError('file .xlsx rusak (local header)')
  const nameLen = view.getUint16(entry.localOffset + 26, true)
  const extraLen = view.getUint16(entry.localOffset + 28, true)
  const start = entry.localOffset + 30 + nameLen + extraLen
  const data = bytes.slice(start, start + entry.compressedSize)
  let out: Uint8Array
  if (entry.method === 0) out = data
  else if (entry.method === 8) out = inflateRawSync(data, { maxOutputLength: 64 * 1024 * 1024 })
  else throw new RevenueError(`kompresi zip metode ${entry.method} tidak didukung`)
  return new TextDecoder().decode(out)
}

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function xmlText(raw: string): string {
  return raw.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
    return XML_ENTITIES[e.toLowerCase()] ?? ''
  })
}

/** Teks semua <t> di dalam potongan XML (rich text = beberapa run). */
function joinedText(fragment: string): string {
  return [...fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => xmlText(m[1] ?? '')).join('')
}

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A'
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

export function parseXlsx(bytes: Uint8Array): { headers: string[]; rows: Record<string, string>[] } {
  const entries = zipEntries(bytes)
  const find = (name: string) => entries.find((e) => e.name === name)
  // Worksheet pertama menurut workbook.xml + relasinya; fallback sheet1.xml.
  let sheetPath = 'xl/worksheets/sheet1.xml'
  const workbook = find('xl/workbook.xml')
  const rels = find('xl/_rels/workbook.xml.rels')
  if (workbook && rels) {
    const firstSheet = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(readZipEntry(bytes, workbook))?.[1]
    const target = firstSheet ? new RegExp(`<Relationship\\b[^>]*Id="${firstSheet}"[^>]*Target="([^"]+)"`).exec(readZipEntry(bytes, rels))?.[1]
      ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${firstSheet}"`).exec(readZipEntry(bytes, rels))?.[1] : undefined
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
  }
  const sheet = find(sheetPath)
  if (!sheet) throw new RevenueError('worksheet pertama tidak ditemukan di file .xlsx')
  const sharedEntry = find('xl/sharedStrings.xml')
  const shared = sharedEntry ? [...readZipEntry(bytes, sharedEntry).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => joinedText(m[1] ?? '')) : []

  const matrix: string[][] = []
  for (const rowMatch of readZipEntry(bytes, sheet).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = []
    let next = 0
    for (const cell of (rowMatch[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1] ?? ''
      const inner = cell[2] ?? ''
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1]
      const index = ref ? columnIndex(ref) : next
      next = index + 1
      if (index >= MAX_COLUMNS) continue
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? 'n'
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
      cells[index] = type === 's' ? (shared[Number(v)] ?? '')
        : type === 'inlineStr' ? joinedText(inner)
        : type === 'b' ? (v === '1' ? 'TRUE' : 'FALSE')
        : v !== undefined ? xmlText(v) : ''
    }
    matrix.push(Array.from({ length: cells.length }, (_, i) => cells[i] ?? ''))
    if (matrix.length > MAX_IMPORT_ROWS + 1) break
  }
  const [head, ...body] = matrix
  const headers = uniqueHeaders(head ?? [])
  return { headers, rows: toRows(headers, body) }
}
