// Import CSS untuk efek samping (import './styles.css' di entry template)
// diproses bundler. Deklarasi ini membuat tsconfig server Nuxt menerimanya,
// karena server/utils/templates.test.ts meng-import registry Vue.
declare module '*.css'
