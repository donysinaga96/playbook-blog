import { describe, expect, it } from 'vitest'
import { embedSrc } from './embed'

describe('embedSrc', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['https://m.youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
  ])('youtube %s', (url, src) => {
    expect(embedSrc('youtube', url)).toBe(src)
  })

  it.each([
    ['https://vimeo.com/76979871', 'https://player.vimeo.com/video/76979871?dnt=1'],
    ['https://player.vimeo.com/video/76979871', 'https://player.vimeo.com/video/76979871?dnt=1'],
  ])('vimeo %s', (url, src) => {
    expect(embedSrc('vimeo', url)).toBe(src)
  })

  it.each<[Parameters<typeof embedSrc>[0], string]>([
    ['youtube', 'https://evil.example/watch?v=dQw4w9WgXcQ'],
    ['youtube', 'https://www.youtube.com.evil.example/watch?v=dQw4w9WgXcQ'],
    ['youtube', 'http://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['youtube', 'https://www.youtube.com/watch?v=pendek'],
    ['youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ"><script>'],
    ['youtube', 'https://www.youtube.com/channel/UC123'],
    ['vimeo', 'https://vimeo.com/channels/staffpicks'],
    ['vimeo', 'https://youtube.com/76979871'],
    ['x', 'https://x.com/kabartekno/status/1'],
    ['youtube', 'bukan url'],
  ])('tidak menghasilkan iframe: %s %s', (provider, url) => {
    expect(embedSrc(provider, url)).toBeNull()
  })
})
