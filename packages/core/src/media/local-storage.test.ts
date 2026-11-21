import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { createLocalMediaStorage, newStorageKey } from './local-storage'

describe('storage media lokal', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'media-'))
  const storage = createLocalMediaStorage(dir)
  afterAll(() => rm(dir, { recursive: true, force: true }))

  it('storage_key dibuat server: kode site, tahun/bulan UTC, uuid, ekstensi', () => {
    expect(newStorageKey('dapur-nusantara', 'webp', new Date('2026-11-30T20:00:00Z'))).toMatch(/^dapur-nusantara\/2026\/11\/[0-9a-f-]{36}\.webp$/)
    expect(newStorageKey('a', 'png')).not.toBe(newStorageKey('a', 'png'))
  })

  it('tulis, baca, hapus; tanpa file sementara tersisa', async () => {
    const key = newStorageKey('uji', 'png')
    await storage.put(key, new Uint8Array([1, 2, 3]))
    expect(await storage.read(key)).toEqual(new Uint8Array([1, 2, 3]))
    const folder = join(dir, ...key.split('/').slice(0, -1))
    expect((await readdir(folder)).filter((f) => f.endsWith('.tmp'))).toEqual([])
    await storage.delete(key)
    expect(await storage.read(key)).toBeNull()
    await storage.delete(key) // sudah tidak ada: tidak error
  })

  it.each(['../luar.png', 'uji/../../luar.png', 'uji//a.png', '/abs/a.png', 'satu-segmen.png', 'uji/a b.png'])('menolak key %j', async (key) => {
    await expect(storage.put(key, new Uint8Array([1]))).rejects.toThrow(/storage_key tidak valid/)
    await expect(storage.read(key)).rejects.toThrow(/storage_key tidak valid/)
  })
})
