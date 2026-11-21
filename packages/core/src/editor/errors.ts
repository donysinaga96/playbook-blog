import { z } from 'zod'

// Galat operasi tulis admin (M4). Lapisan API memetakannya ke status HTTP:
//   not-found -> 404   (termasuk data site lain: keberadaannya tidak dibocorkan)
//   conflict  -> 409   (versi berbeda: data sudah diubah orang/tab lain)
//   invalid   -> 422   (input tidak lolos aturan; `issues` per field)
export type EditorErrorKind = 'not-found' | 'conflict' | 'invalid'

export interface FieldIssue {
  /** Path field, mis. 'slug', 'body.blocks.3.text'. '' = seluruh input. */
  field: string
  message: string
}

export class EditorError extends Error {
  override name = 'EditorError'
  constructor(
    readonly kind: EditorErrorKind,
    message: string,
    readonly issues: FieldIssue[] = [],
  ) {
    super(message)
  }
}

export const notFound = (what: string) => new EditorError('not-found', `${what} tidak ditemukan`)
export const conflict = (what: string) =>
  new EditorError('conflict', `${what} sudah diubah di tempat lain; muat ulang lalu simpan lagi`)
export const invalid = (issues: FieldIssue[]) =>
  new EditorError('invalid', issues.map((i) => (i.field ? `${i.field}: ${i.message}` : i.message)).join('; '), issues)

const indonesian = z.locales.id().localeError

/**
 * Pesan validasi untuk form admin: kasus yang paling sering dengan kalimat
 * biasa, sisanya locale Indonesia bawaan Zod. Dipakai per parse (bukan
 * konfigurasi global Zod).
 */
export const editorErrorMap: z.core.$ZodErrorMap = (issue) => {
  if (issue.code === 'too_small' && issue.origin === 'string' && Number(issue.minimum) === 1) return 'Wajib diisi'
  if (issue.code === 'too_big' && issue.origin === 'string') return `Maksimal ${String(issue.maximum)} karakter`
  if (issue.code === 'too_small' && issue.origin === 'array' && Number(issue.minimum) === 1) return 'Isi minimal satu butir'
  if (issue.code === 'invalid_format' && issue.format === 'uuid' && issue.input === '') return 'Wajib dipilih'
  return indonesian(issue)
}
