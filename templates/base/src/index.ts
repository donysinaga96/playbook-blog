// Template base: semua komponen UI default, dipakai bersama oleh semua
// template (ADR-005). Gaya netral; template lain membedakan diri lewat
// token, opsi, dan CSS di bawah kelas root-nya.
import { defineTemplate } from '@framework/template-kit'
import { baseOptionDefaults, baseOptionsSchema, baseTokenDefaults, baseTokenSchema } from './config'
import './styles/fonts.css'
import './styles/base.css'

export default defineTemplate({
  key: 'base',
  version: '1.0.0',
  name: 'Base',
  tokens: { schema: baseTokenSchema, defaults: baseTokenDefaults },
  options: { schema: baseOptionsSchema, defaults: baseOptionDefaults },
  menuLocations: ['header', 'footer'],
  adSlots: [],
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
