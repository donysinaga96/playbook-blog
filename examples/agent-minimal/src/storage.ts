// Penyimpanan gambar. Sekarang: folder lokal yang sama dengan MEDIA_DIR
// aplikasi (file di <dir>/<storageKey>). Setelah provider object storage
// dipilih, buat implementasi lain dengan antarmuka yang sama.
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'

export interface ImageStorage {
  put(storageKey: string, bytes: Uint8Array): Promise<void>
}

// Aturan key sama dengan aplikasi: huruf kecil, angka, titik, _ dan -,
// dipisah "/", segmen pertama = kode site, tanpa "." / "..".
const SEGMENT = /^[a-z0-9][a-z0-9._-]*$/

export function assertStorageKey(storageKey: string, siteCode: string): void {
  const segments = storageKey.split('/')
  const valid = segments.length >= 2 && segments.every((s) => SEGMENT.test(s) && s !== '.' && s !== '..')
  if (!valid || segments[0] !== siteCode) {
    throw new Error(`storageKey tidak valid (harus "${siteCode}/...", huruf kecil): ${storageKey}`)
  }
}

export function localDirStorage(directory: string): ImageStorage {
  const base = resolve(directory)
  return {
    async put(storageKey, bytes) {
      const file = join(base, ...storageKey.split('/'))
      if (!file.startsWith(base + sep)) throw new Error(`storageKey keluar dari folder: ${storageKey}`)
      await mkdir(dirname(file), { recursive: true })
      // Tulis ke file sementara lalu rename: aplikasi tidak pernah membaca file setengah jadi.
      const temp = `${file}.${randomUUID()}.tmp`
      try {
        await writeFile(temp, bytes, { flag: 'wx' })
        await rename(temp, file)
      } catch (error) {
        await rm(temp, { force: true })
        throw error
      }
    },
  }
}
