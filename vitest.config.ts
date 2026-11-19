import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// .env lokal (mis. DATABASE_URL) ikut terbaca; di CI tanpa .env, test yang
// butuh database otomatis dilewati.
const envFile = new URL('.env', import.meta.url)
const env = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {}

// plugin-vue: test template merender komponen .vue (SSR) tanpa Nuxt.
export default defineConfig({
  plugins: [vue()],
  test: {
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '_archive/**', '**/.nuxt/**', '**/.output/**'],
    env,
  },
})
