// URL iframe untuk block embed, dibangun dari provider + url (bukan HTML
// mentah dari penulis). Hanya bentuk URL yang dikenal yang menghasilkan
// iframe; selain itu null dan template menampilkan tautan biasa.
//
//   youtube  -> https://www.youtube-nocookie.com/embed/<id>  (tanpa cookie pelacak sebelum diputar)
//   vimeo    -> https://player.vimeo.com/video/<id>?dnt=1
//   x        -> null: X hanya bisa di-embed lewat script widget mereka,
//               yang tidak dimuat (privasi dan kecepatan), jadi tampil sebagai tautan.

export type EmbedProvider = 'youtube' | 'vimeo' | 'x'

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com'])
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'])

export function embedSrc(provider: EmbedProvider, url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null
  const segments = parsed.pathname.split('/').filter(Boolean)

  switch (provider) {
    case 'youtube': {
      if (!YOUTUBE_HOSTS.has(parsed.hostname)) return null
      let id: string | null | undefined
      if (parsed.hostname === 'youtu.be') id = segments[0]
      else if (segments[0] === 'watch') id = parsed.searchParams.get('v')
      else if (segments[0] === 'embed' || segments[0] === 'shorts' || segments[0] === 'live') id = segments[1]
      return id && YOUTUBE_ID.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null
    }
    case 'vimeo': {
      if (!VIMEO_HOSTS.has(parsed.hostname)) return null
      const id = parsed.hostname === 'player.vimeo.com' && segments[0] === 'video' ? segments[1] : segments[0]
      return id && /^\d{1,12}$/.test(id) ? `https://player.vimeo.com/video/${id}?dnt=1` : null
    }
    case 'x':
      return null
  }
}
