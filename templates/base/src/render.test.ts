// Render SSR komponen base dengan view model contoh, tanpa Nuxt. Menjamin:
//  - manifest menunjuk ke file view yang benar-benar ada dan bisa dirender,
//  - setiap view menampilkan data utamanya,
//  - teks dari konten selalu di-escape (tidak ada v-html),
//  - SmartImage memakai titik fokus, menu bersarang, pagination dengan celah.
import { VIEW_NAMES, type ComponentLoader } from '@framework/template-kit'
import { describe, expect, it } from 'vitest'
import { createSSRApp, h, type Component } from 'vue'
import { renderToString } from 'vue/server-renderer'
import base from './index'
import { baseOptionDefaults } from './config'
import SmartImage from './components/SmartImage.vue'
import { chrome, homeWithSections, image, views } from './test-fixtures'

async function load(loader: ComponentLoader): Promise<Component> {
  const mod = await loader()
  return 'default' in mod ? (mod.default as Component) : mod
}

async function render(component: Component, props: Record<string, unknown>, slot?: () => unknown): Promise<string> {
  return renderToString(createSSRApp({ render: () => h(component, props, slot ? { default: slot } : undefined) }))
}

describe('template base: view', () => {
  it.each(VIEW_NAMES)('view %s dirender', async (name) => {
    const html = await render(await load(base.views[name]), { vm: views[name] })
    expect(html).toContain(`view--${name}`)
  })

  it('home: kartu utama, daftar terbaru, pagination dengan celah', async () => {
    const html = await render(await load(base.views.home), { vm: views.home })
    expect(html).toContain('article-card--lead')
    expect(html).toContain('Artikel 2')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('pagination__gap')
    expect(html).toContain('rel="next"')
  })

  it('home dengan section: setiap tipe dirender dari base, urutan sesuai layout, pagination tetap', async () => {
    const html = await render(await load(base.views.home), { vm: homeWithSections })
    const order = ['section--hero', 'section--latest-grid', 'section--headline-list', 'section--category-strip'].map((c) => html.indexOf(c))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(html).toContain('article-card--lead')
    expect(html).toContain('Kabar &lt;b&gt;cepat&lt;/b&gt;')
    expect(html).toContain('<a href="/category/gadget">Gadget</a>')
    expect(html).toContain('Lihat semua')
    expect(html).toContain('aria-labelledby="section-3-title"')
    expect(html).toContain('id="section-3-title"')
    expect(html).toContain('rel="next"')
    // Tipe tanpa komponen dan section kosong tidak merender apa-apa.
    expect(html).not.toContain('Artikel 6')
    expect(html).not.toContain('Kosong')
    // Mode section tidak merender daftar lama.
    expect(html).not.toContain('judul-terbaru')
  })

  it('artikel: semua tipe block, teks di-escape', async () => {
    const html = await render(await load(base.views.article), { vm: views.article })
    expect(html).toContain('Ponsel &lt;script&gt;alert(1)&lt;/script&gt; lipat')
    expect(html).not.toContain('<script>')
    expect(html).toContain('Paragraf &lt;b&gt;polos&lt;/b&gt;.')
    expect(html).toMatch(/<h3[^>]*>\s*Subjudul\s*<\/h3>/)
    expect(html).toContain('<ol>')
    expect(html).toContain('<cite>Narasumber</cite>')
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"')
    expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"')
    expect(html).toContain('title="Video YouTube"')
    expect(html).toContain('Lihat di X')
    expect(html).toContain('rel="tag"')
    expect(html).toContain('article--review')
  })

  it('tipe block tidak dikenal tidak merender apa-apa dan tidak crash', async () => {
    const BlockRenderer = (await import('./components/BlockRenderer.vue')).default
    const html = await render(BlockRenderer, { blocks: [{ type: 'carousel', items: [] }, { type: 'paragraph', text: 'Tetap ada' }] })
    expect(html).toContain('Tetap ada')
    expect(html).not.toContain('carousel')
  })

  it('pencarian: form memakai URL dari view model', async () => {
    const html = await render(await load(base.views.search), { vm: views.search })
    expect(html).toContain('action="/cari"')
    expect(html).toContain('value="lipat"')
  })

  it('daftar kosong menampilkan teks pengganti', async () => {
    const html = await render(await load(base.views.tag), { vm: views.tag })
    expect(html).toContain('Belum ada artikel dengan tag ini.')
  })
})

describe('template base: layout', () => {
  it('header, menu bersarang, footer, dan isi slot', async () => {
    const html = await render(await load(base.layout), { chrome, options: baseOptionDefaults }, () => h('p', 'ISI'))
    expect(html).toContain('site-header--left')
    expect(html).toContain('Kabar Tekno')
    expect(html).toContain('menu-tree--sub')
    expect(html).toContain('href="/gadget/ponsel"')
    expect(html).toContain('target="_blank" rel="noopener noreferrer"')
    expect(html).toContain('href="/p/tentang"')
    expect(html).toContain('<p>ISI</p>')
    expect(html).not.toContain('19 November 2026')
  })

  it('opsi header: tengah dan tanggal', async () => {
    const html = await render(await load(base.layout), { chrome, options: { header: { style: 'centered', showDate: true } } })
    expect(html).toContain('site-header--centered')
    expect(html).toContain('<time datetime="2026-11-19">Kamis, 19 November 2026</time>')
  })

  it('logo dipakai bila ada, dengan nama site sebagai alt', async () => {
    const html = await render(await load(base.layout), { chrome: { ...chrome, site: { ...chrome.site, logo: image } }, options: baseOptionDefaults })
    expect(html).toContain('alt="Kabar Tekno"')
    expect(html).not.toContain('site-header__name')
  })
})

describe('SmartImage', () => {
  it('rasio dan titik fokus', async () => {
    const html = await render(SmartImage, { image, ratio: '16/9' })
    expect(html).toContain('aspect-ratio:16/9')
    expect(html).toContain('object-position:62% 40%')
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('width="1600"')
  })

  it('tanpa rasio: tampil utuh; eager memberi prioritas', async () => {
    const html = await render(SmartImage, { image, loading: 'eager' })
    expect(html).not.toContain('object-fit')
    expect(html).toContain('fetchpriority="high"')
  })

  it('rasio tidak valid diabaikan', async () => {
    const html = await render(SmartImage, { image, ratio: '16/9;color:red' })
    expect(html).not.toContain('aspect-ratio')
  })
})
