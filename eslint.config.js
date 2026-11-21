import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'

// Paket yang mengakses data. Template dan template-kit tidak boleh
// bergantung padanya (lihat docs/adr/005-kontrak-template.md).
const DATA_LAYER = ['@framework/core', '@framework/db', 'drizzle-orm', 'drizzle-orm/*', 'pg', 'postgres']

export default defineConfig(
  globalIgnores([
    '**/node_modules/',
    '**/.nuxt/',
    '**/.output/',
    '**/dist/',
    '**/coverage/',
    '_archive/',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,

  // File .vue: aturan Vue yang disarankan. Blok <script lang="ts"> diparse
  // dengan parser typescript-eslint, sehingga aturan import di bawah juga
  // berlaku untuk komponen template.
  pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
    // Nama yang tidak terdefinisi diperiksa vue-tsc (pnpm typecheck), seperti
    // typescript-eslint mematikan aturan ini untuk .ts. Tanpa ini, auto-import
    // Nuxt (useState, useRequestEvent, ...) dianggap error.
    rules: { 'no-undef': 'off' },
  },

  // Nama file halaman dan layout Nuxt menentukan route/nama layout
  // (index.vue, login.vue, [...slug].vue, admin.vue), jadi aturan nama
  // komponen multi-kata tidak berlaku.
  {
    files: ['apps/web/app/pages/**/*.vue', 'apps/web/app/layouts/**/*.vue'],
    rules: { 'vue/multi-word-component-names': 'off' },
  },

  // Script dan config yang jalan di Node.
  {
    files: ['**/*.{js,mjs}', '**/scripts/**', '*.config.ts', 'packages/*/*.config.ts'],
    languageOptions: { globals: globals.node },
  },

  // File hasil generate drizzle-kit pull: tidak diedit tangan, jadi tidak di-lint.
  globalIgnores(['packages/db/src/schema/schema.ts', 'packages/db/src/schema/relations.ts']),

  // Template hanya boleh memakai kontrak template (template-kit) dan
  // komponen dasar (template-base). Tidak boleh core, db, atau driver
  // database, dan tidak boleh menembus ke folder apps/ atau packages/
  // lewat path relatif.
  {
    files: ['templates/**/*.{js,ts,mts,vue}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@framework/*', '!@framework/template-kit', '!@framework/template-kit/*', '!@framework/template-base', '!@framework/template-base/*'],
            message: 'Template hanya boleh import @framework/template-kit dan @framework/template-base (ADR-005).',
          },
          {
            group: DATA_LAYER.filter((p) => !p.startsWith('@framework/')),
            message: 'Template tidak boleh mengakses database; data datang dari view model core (ADR-005).',
          },
          {
            regex: '^(\\.\\./)+(apps|packages)(/|$)',
            message: 'Template tidak boleh import kode apps/ atau packages/ lewat path relatif (ADR-005).',
          },
        ],
      }],
    },
  },

  // Kode aplikasi Vue (apps/web/app) dirender di browser dan di bundle SSR
  // Vue. Entry @framework/core membawa @framework/db dan driver pg, yang
  // rusak bila ikut di-bundle di sana. Dari kedua paket itu hanya boleh
  // import tipe; fungsi murni lewat subpath seperti @framework/core/media.
  // Data dari database datang lewat server/ (event.context, server API).
  {
    files: ['apps/web/app/**/*.{js,ts,mts,vue}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        paths: ['@framework/core', '@framework/db'].map((name) => ({
          name,
          allowTypeImports: true,
          message: 'Kode app/ hanya boleh import tipe dari paket ini; pakai subpath murni (mis. @framework/core/media) atau ambil data lewat server/.',
        })),
        patterns: [{
          group: DATA_LAYER.filter((p) => !p.startsWith('@framework/')),
          message: 'Driver database tidak boleh di kode app/ (ikut ke bundle browser).',
        }],
      }],
    },
  },

  // Kontrak template tidak boleh bergantung pada database.
  {
    files: ['packages/template-kit/**/*.{js,ts,mts}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: DATA_LAYER,
          message: 'template-kit tidak boleh bergantung pada core atau database (ADR-005).',
        }],
      }],
    },
  },
)
