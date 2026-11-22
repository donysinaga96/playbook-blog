// Sisi TULIS storage media di disk lokal (M4 4.3). Adapter yang sama nanti
// bisa diganti R2/S3 (M5) tanpa mengubah pemanggil: put, read, delete.
//
//  - storage_key dibuat server (newStorageKey), tidak pernah dari nama file
//    kiriman pengguna; path dicek ketat agar tidak keluar dari folder dasar.
//  - Tulis atomik: file sementara di folder yang sama, lalu rename, sehingga
//    pembaca tidak pernah melihat file setengah jadi.
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { splitStorageKey } from './storage'

export interface MediaStorage {
  put(storageKey: string, data: Uint8Array): Promise<void>
  /** Isi file; null bila tidak ada. */
  read(storageKey: string): Promise<Uint8Array | null>
  /** Ukuran file dalam byte tanpa membacanya; null bila tidak ada. */
  size(storageKey: string): Promise<number | null>
  /** Hapus file; tidak error bila sudah tidak ada. */
  delete(storageKey: string): Promise<void>
}

/** storage_key baru: <kode-site>/<yyyy>/<mm>/<uuid>.<ext>. */
export function newStorageKey(siteCode: string, extension: string, now = new Date()): string {
  const yyyy = String(now.getUTCFullYear())
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const key = `${siteCode}/${yyyy}/${mm}/${randomUUID()}.${extension}`
  if (!splitStorageKey(key)) throw new Error(`storage_key tidak valid: ${key}`)
  return key
}

export function createLocalMediaStorage(directory: string): MediaStorage {
  const base = resolve(directory)

  function pathOf(storageKey: string): string {
    const segments = splitStorageKey(storageKey)
    const file = segments ? join(base, ...segments) : ''
    if (!segments || !file.startsWith(base + sep)) throw new Error(`storage_key tidak valid: ${JSON.stringify(storageKey)}`)
    return file
  }

  return {
    async put(storageKey, data) {
      const file = pathOf(storageKey)
      await mkdir(dirname(file), { recursive: true })
      const temp = `${file}.${randomUUID()}.tmp`
      try {
        // 'wx': gagal bila file sementara sudah ada (tidak pernah menimpa).
        await writeFile(temp, data, { flag: 'wx' })
        await rename(temp, file)
      } catch (error) {
        await rm(temp, { force: true })
        throw error
      }
    },
    async read(storageKey) {
      try {
        return new Uint8Array(await readFile(pathOf(storageKey)))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      }
    },
    async size(storageKey) {
      try {
        return (await stat(pathOf(storageKey))).size
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      }
    },
    async delete(storageKey) {
      await rm(pathOf(storageKey), { force: true })
    },
  }
}
