import { describe, expect, it } from 'vitest'
import type { MediaRef } from '../repositories/types'
import { createMediaUrlResolver, splitStorageKey, toImageView } from './storage'

describe('createMediaUrlResolver', () => {
  it('default /media', () => {
    expect(createMediaUrlResolver()('kabar-tekno/2026/11/hp.webp')).toBe('/media/kabar-tekno/2026/11/hp.webp')
  })

  it('baseUrl absolut, slash di ujung diabaikan', () => {
    expect(createMediaUrlResolver({ baseUrl: 'https://cdn.example.com/m/' })('dapur-nusantara/logo.svg')).toBe('https://cdn.example.com/m/dapur-nusantara/logo.svg')
  })

  it.each(['../etc/passwd', 'kabar-tekno/../dapur/x.png', '/kabar-tekno/x.png', 'kabar-tekno//x.png', 'logo.svg', 'kabar-tekno/a b.png', 'kabar-tekno/%2e%2e/x'])(
    'menolak key tidak sah: %s',
    (key) => {
      expect(splitStorageKey(key)).toBeNull()
      expect(() => createMediaUrlResolver()(key)).toThrow(/storage_key tidak valid/)
    },
  )
})

describe('toImageView', () => {
  const media: MediaRef = {
    id: 'm1', storageKey: 'kabar-tekno/2026/11/hp.webp', mimeType: 'image/webp', width: 1600, height: 900,
    altText: null, caption: 'Foto: redaksi', credit: null, sourceUrl: null, focalX: 0.62, focalY: 0.4,
  }

  it('memetakan semua field dan memakai alt cadangan', () => {
    expect(toImageView(media, createMediaUrlResolver(), 'Ponsel lipat')).toEqual({
      src: '/media/kabar-tekno/2026/11/hp.webp', alt: 'Ponsel lipat', width: 1600, height: 900,
      focalX: 0.62, focalY: 0.4, caption: 'Foto: redaksi', credit: null, sourceUrl: null,
    })
  })
})
