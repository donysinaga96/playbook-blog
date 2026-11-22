// Log terstruktur (M5 5.5, usulan M5-E): satu baris JSON per kejadian ke
// stdout (info/warn) atau stderr (error), agar error dan latency per site bisa
// dihitung dari log tanpa layanan tambahan (scripts/log-report.mjs).
//
//   {"time":"…","level":"info","msg":"request","site":"kabar-tekno","status":200,"ms":12.3,…}
//
// LOG_FORMAT=text (dev) mencetak satu baris yang mudah dibaca manusia; bawaan json.
// Galat diserialisasi sebagai { name, message, stack } (stack hanya baris awal).

export type LogLevel = 'info' | 'warn' | 'error'
export type LogFields = Record<string, unknown>

const textFormat = () => process.env['LOG_FORMAT'] === 'text'

function serialize(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack?.split('\n').slice(0, 6).join('\n') }
  }
  return value
}

export function log(level: LogLevel, msg: string, fields: LogFields = {}) {
  const entry: LogFields = { time: new Date().toISOString(), level, msg }
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) entry[key] = serialize(value)
  const line = textFormat()
    ? `${entry['time'] as string} ${level.toUpperCase()} ${msg} ${Object.entries(entry).filter(([k]) => !['time', 'level', 'msg'].includes(k)).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' ')}`
    : JSON.stringify(entry)
  if (level === 'error') process.stderr.write(`${line}\n`)
  else process.stdout.write(`${line}\n`)
}
