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
