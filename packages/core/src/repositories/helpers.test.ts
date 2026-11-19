import { describe, expect, it } from 'vitest'
import { normalizePath } from './content-repository'
import { normalizeHost } from './site-repository'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, normalizePaging, toPage } from './types'

describe('normalizeHost', () => {
  it.each([
    ['tekno.local.test', 'tekno.local.test'],
    ['TEKNO.Local.Test', 'tekno.local.test'],
    ['tekno.local.test:3000', 'tekno.local.test'],
    ['tekno.local.test.', 'tekno.local.test'],
    ['  www.tekno.local.test  ', 'www.tekno.local.test'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeHost(input)).toBe(expected)
  })

  it.each([
    '',
    '   ',
    'localhost', // harus punya titik, sama dengan CHECK site_domains_domain_format
    'tekno.local.test/path',
    'user@tekno.local.test',
    'tekno local.test',
    'http://tekno.local.test',
    '-bad.local.test',
    `${'a'.repeat(64)}.test`,
  ])('menolak %j', (input) => {
    expect(normalizeHost(input)).toBeNull()
  })
})

describe('normalizePath', () => {
  it.each([
    ['/gadget/ponsel', '/gadget/ponsel'],
    ['/gadget/ponsel/', '/gadget/ponsel'],
    ['/gadget/ponsel?utm=x#bagian', '/gadget/ponsel'],
    ['/', '/'],
    ['/?page=2', '/'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizePath(input)).toBe(expected)
  })

  it.each(['', 'gadget', '//evil.test/x', 'https://evil.test/x', '/dengan spasi'])('menolak %j', (input) => {
    expect(normalizePath(input)).toBeNull()
  })
})

describe('normalizePaging', () => {
  it('default: halaman 1, 10 per halaman', () => {
    expect(normalizePaging()).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE, offset: 0 })
  })

  it('menghitung offset', () => {
    expect(normalizePaging({ page: 3, pageSize: 20 })).toEqual({ page: 3, pageSize: 20, offset: 40 })
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('halaman %s dianggap 1', (page) => {
    expect(normalizePaging({ page }).page).toBe(1)
  })

  it('membatasi pageSize antara 1 dan maksimum', () => {
    expect(normalizePaging({ pageSize: 0 }).pageSize).toBe(1)
    expect(normalizePaging({ pageSize: 10_000 }).pageSize).toBe(MAX_PAGE_SIZE)
    expect(normalizePaging({ pageSize: 2.5 }).pageSize).toBe(DEFAULT_PAGE_SIZE)
  })

  it('toPage menghitung totalPages', () => {
    expect(toPage([], 21, 1, 10).totalPages).toBe(3)
    expect(toPage([], 0, 1, 10).totalPages).toBe(0)
  })
})
