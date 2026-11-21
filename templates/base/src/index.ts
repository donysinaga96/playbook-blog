// Template base: semua komponen UI default, dipakai bersama oleh semua
// template (ADR-005). Gaya netral; template lain membedakan diri lewat
// token, opsi, layout section, dan CSS di bawah kelas root-nya.
//
// Manifest (skema, section, defaultLayouts) ada di ./manifest.ts agar bisa
// dipakai server tanpa Vue/CSS (ADR-008); di sini ditambah komponen.
import { defineTemplate } from '@framework/template-kit'
import manifest from './manifest'
import './styles/fonts.css'
import './styles/base.css'

export default defineTemplate({
  manifest,
  layout: () => import('./TemplateLayout.vue'),
  views: {
    home: () => import('./views/HomeView.vue'),
    article: () => import('./views/ArticleView.vue'),
    page: () => import('./views/PageView.vue'),
    category: () => import('./views/CategoryView.vue'),
    tag: () => import('./views/TagView.vue'),
    author: () => import('./views/AuthorView.vue'),
    search: () => import('./views/SearchView.vue'),
    'not-found': () => import('./views/NotFoundView.vue'),
  },
})

export * from './config'
export { sectionComponents } from './sections/components'
