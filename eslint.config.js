import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

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
