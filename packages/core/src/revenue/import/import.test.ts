import { crc32, deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { RevenueError } from '../types'
import { importMappingSchema, mapImportRows, parseDateText, suggestMapping } from './mapping'
import { detectDelimiter, parseCsv, parseImportFile, parseJsonTable } from './parse-file'

const enc = (s: string) => new TextEncoder().encode(s)

/** Zip minimal (deflate) untuk membuat file .xlsx uji tanpa dependensi. */
function zip(files: Record<string, string>): Uint8Array {
  const chunks: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content, 'utf8')
    const compressed = deflateRawSync(data)
    const nameBuf = Buffer.from(name)
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8)
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26)
    chunks.push(local, nameBuf, compressed)
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10)
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(compressed.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nameBuf.length, 28); c.writeUInt32LE(offset, 42)
    central.push(c, nameBuf)
    offset += 30 + nameBuf.length + compressed.length
  }
  const cd = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...chunks, cd, end]))
}

describe('parser CSV', () => {
  it('pemisah terdeteksi (koma, titik koma, tab), BOM dibuang, tanda kutip dan baris baru dalam sel', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';')
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t')
    const table = parseImportFile('x.csv', enc('﻿Tanggal,Produk,Nominal\n2026-11-01,"Kelas ""Pro"", batch 2",150000\r\n2026-11-02,"baris\nbaru",75000\n\n'))
    expect(table.format).toBe('csv')
    expect(table.headers).toEqual(['Tanggal', 'Produk', 'Nominal'])
    expect(table.rows).toEqual([
      { Tanggal: '2026-11-01', Produk: 'Kelas "Pro", batch 2', Nominal: '150000' },
      { Tanggal: '2026-11-02', Produk: 'baris\nbaru', Nominal: '75000' },
    ])
  })
  it('nama kolom kosong/duplikat dibuat unik', () => {
    expect(parseCsv('Amount,,Amount\n1,2,3').headers).toEqual(['Amount', 'Kolom 2', 'Amount (2)'])
  })
  it('tanda kutip tidak ditutup -> galat jelas', () => {
    expect(() => parseCsv('a,b\n"1,2')).toThrow(/tanda kutip/)
  })
})

describe('parser JSON', () => {
  it('array object, atau object dengan items; object bersarang diratakan', () => {
    expect(parseJsonTable('[{"date":"2026-11-01","amount":1.5,"meta":{"site":"a.com"}}]')).toEqual({
      headers: ['date', 'amount', 'meta.site'],
      rows: [{ date: '2026-11-01', amount: '1.5', 'meta.site': 'a.com' }],
    })
    expect(parseJsonTable('{"items":[{"a":1},{"b":2}]}').headers).toEqual(['a', 'b'])
    expect(() => parseJsonTable('{"x":1}')).toThrow(RevenueError)
    expect(() => parseJsonTable('[1,2]')).toThrow(RevenueError)
  })
})

describe('parser XLSX', () => {
  it('membaca worksheet pertama: shared strings, inline string, angka, sel kosong di tengah', () => {
    const file = zip({
      'xl/workbook.xml': '<workbook xmlns:r="r"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/sharedStrings.xml': '<sst><si><t>Date</t></si><si><t>Amount</t></si><si><t>Product</t></si><si><r><t>Kelas </t></r><r><t>&amp; Modul</t></r></si></sst>',
      'xl/worksheets/sheet1.xml': '<worksheet><sheetData>'
        + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>'
        + '<row r="2"><c r="A2"><v>46327</v></c><c r="B2"><v>12.5</v></c><c r="C2" t="s"><v>3</v></c></row>'
        + '<row r="3"><c r="A3" t="inlineStr"><is><t>2026-11-02</t></is></c><c r="C3" t="inlineStr"><is><t>E-book</t></is></c></row>'
        + '</sheetData></worksheet>',
    })
    const table = parseImportFile('laporan.xlsx', file)
    expect(table.format).toBe('xlsx')
    expect(table.headers).toEqual(['Date', 'Amount', 'Product'])
    expect(table.rows).toEqual([
      { Date: '46327', Amount: '12.5', Product: 'Kelas & Modul' },
      { Date: '2026-11-02', Amount: '', Product: 'E-book' },
    ])
    expect(parseDateText('46327', 'auto')).toBe('2026-11-01') // nomor seri Excel
  })
  it('.xls lama ditolak dengan arahan', () => {
    expect(() => parseImportFile('lama.xls', new Uint8Array([0x50, 0x4b, 3, 4]))).toThrow(/xlsx atau CSV/)
  })
})

describe('mapping kolom impor', () => {
  it('usulan mapping dari nama kolom umum', () => {
    expect(suggestMapping(['Payment ID', 'Created At', 'Product', 'Amount', 'Currency', 'Status'])).toMatchObject({
      date: 'Created At', amount: 'Amount', currency: 'Currency', externalId: 'Payment ID', status: 'Status', description: 'Product',
    })
  })

  it('tanggal: ISO, DD/MM, MM/DD; ambigu ditolak pada mode auto', () => {
    expect(parseDateText('2026-11-01T10:00:00Z', 'auto')).toBe('2026-11-01')
    expect(parseDateText('25/11/2026', 'auto')).toBe('2026-11-25')
    expect(parseDateText('11/25/2026', 'auto')).toBe('2026-11-25')
    expect(parseDateText('03/04/2026', 'auto')).toBeNull()
    expect(parseDateText('03/04/2026', 'DD/MM/YYYY')).toBe('2026-04-03')
    expect(parseDateText('31/02/2026', 'DD/MM/YYYY')).toBeNull()
  })

  const rows = [
    { 'Payment ID': 'pay_1', 'Created At': '2026-11-01', Product: 'Pro', Amount: '$29.00', Currency: 'usd', Status: 'paid' },
    { 'Payment ID': 'pay_2', 'Created At': '2026-11-02', Product: 'Pro', Amount: '29', Currency: 'USD', Status: 'refunded' },
    { 'Payment ID': 'pay_1', 'Created At': '2026-11-01', Product: 'Pro', Amount: '29', Currency: 'USD', Status: 'paid' },
    { 'Payment ID': 'pay_3', 'Created At': 'kemarin', Product: 'Pro', Amount: 'x', Currency: 'USD', Status: 'paid' },
    { 'Payment ID': 'pay_4', 'Created At': '2026-11-03', Product: 'Pro', Amount: '29', Currency: 'USD', Status: 'failed' },
  ]
  const mapping = importMappingSchema.parse({ date: 'Created At', amount: 'Amount', currency: 'Currency', externalId: 'Payment ID', status: 'Status', description: 'Product' })

  it('validasi per baris: inserted/duplikat/galat/status bukan pemasukan dilaporkan dengan nomor baris', () => {
    const result = mapImportRows(rows, mapping, { sourceCode: 'whop', defaultCurrency: 'USD' })
    expect(result.entries.map((e) => [e.row, e.entry.idempotencyKey, e.entry.grossAmount, e.entry.status])).toEqual([
      [1, 'whop:ext:pay_1', '29', 'finalized'],
      [2, 'whop:ext:pay_2:refund', '-29', 'refunded'],
    ])
    expect(result.entries[1]?.entry.note).toBeTruthy()
    expect(result.duplicates).toEqual([
      { row: 3, message: 'duplikat baris 1 di file yang sama' },
      { row: 5, message: 'status "failed" bukan pemasukan; dilewati' },
    ])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.row).toBe(4)
    expect(result.errors[0]?.message).toMatch(/tanggal "kemarin".*nominal/)
  })

  it('tanpa kolom ID: kunci dari hash isi baris (impor ulang file sama -> kunci sama)', () => {
    const m = importMappingSchema.parse({ date: 'Created At', amount: 'Amount', currencyFixed: 'USD' })
    const a = mapImportRows(rows.slice(0, 1), m, { sourceCode: 'whop', defaultCurrency: 'IDR' })
    const b = mapImportRows(rows.slice(0, 1), m, { sourceCode: 'whop', defaultCurrency: 'IDR' })
    expect(a.entries[0]?.entry.idempotencyKey).toMatch(/^whop:row:[0-9a-f]{32}$/)
    expect(a.entries[0]?.entry.idempotencyKey).toBe(b.entries[0]?.entry.idempotencyKey)
    expect(a.entries[0]?.entry.currency).toBe('USD')
  })

  it('kolom domain dipetakan ke properti; metrik angka dibaca', () => {
    const m = importMappingSchema.parse({ date: 'd', amount: 'a', property: 'site', metrics: { impressions: 'imp' }, currencyFixed: 'USD' })
    const result = mapImportRows([{ d: '2026-11-01', a: '1.5', site: 'https://www.beritakonoha.id/', imp: '1,200' }], m, { sourceCode: 'x', defaultCurrency: 'IDR' })
    expect(result.entries[0]?.entry).toMatchObject({ propertyDomain: 'beritakonoha.id', metrics: { impressions: 1200 }, dimensions: { domain: 'https://www.beritakonoha.id/' } })
  })
})
