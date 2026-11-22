import { afterEach, describe, expect, it, vi } from 'vitest'
import { log } from './log'

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env['LOG_FORMAT']
})

function capture(stream: 'stdout' | 'stderr') {
  const lines: string[] = []
  vi.spyOn(process[stream], 'write').mockImplementation((chunk) => {
    lines.push(String(chunk))
    return true
  })
  return lines
}

describe('log', () => {
  it('satu baris JSON; field undefined dibuang; info ke stdout', () => {
    const out = capture('stdout')
    log('info', 'request', { site: 'kabar-tekno', status: 200, ms: 1.5, user: undefined })
    expect(out).toHaveLength(1)
    expect(out[0]?.endsWith('\n')).toBe(true)
    const entry = JSON.parse(out[0] ?? '')
    expect(entry).toMatchObject({ level: 'info', msg: 'request', site: 'kabar-tekno', status: 200, ms: 1.5 })
    expect(entry).not.toHaveProperty('user')
    expect(Number.isNaN(Date.parse(entry.time))).toBe(false)
  })

  it('error ke stderr; Error diserialisasi (name, message, stack pendek)', () => {
    const err = capture('stderr')
    log('error', 'gagal', { error: new TypeError('rusak') })
    const entry = JSON.parse(err[0] ?? '')
    expect(entry.error).toMatchObject({ name: 'TypeError', message: 'rusak' })
    expect(entry.error.stack.split('\n').length).toBeLessThanOrEqual(6)
  })

  it('LOG_FORMAT=text: satu baris mudah dibaca', () => {
    process.env['LOG_FORMAT'] = 'text'
    const out = capture('stdout')
    log('warn', 'theme issue', { site: 'x', issue: 'opsi lama' })
    expect(out[0]).toMatch(/^\S+ WARN theme issue site=x issue=opsi lama\n$/)
  })
})
