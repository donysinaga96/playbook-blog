// Test arsitektur: aturan import di eslint.config.js benar-benar menolak
// template yang mengakses data, dan tetap mengizinkan import yang sah.
// Bila test ini gagal, template bisa diam-diam bergantung pada core/db
// dan tidak lagi bisa ditukar (ADR-005).
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const eslint = new ESLint()

async function restrictedImportErrors(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath })
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === 'no-restricted-imports' || m.ruleId === '@typescript-eslint/no-restricted-imports')
    .map((m) => m.message)
}

describe('aturan import template', () => {
  const file = 'templates/magazine/src/views/Home.ts'

  it.each([
    ['core', "import { getFeed } from '@framework/core'"],
    ['db', "import { db } from '@framework/db'"],
    ['driver drizzle', "import { eq } from 'drizzle-orm'"],
    ['driver pg', "import pg from 'pg'"],
    ['path relatif ke packages/', "import x from '../../../packages/core/src/index'"],
  ])('menolak import %s', async (_label, code) => {
    expect(await restrictedImportErrors(`${code}\nexport { }`, file)).toHaveLength(1)
  })

  it.each([
    ['template-kit', "import { defineTemplate } from '@framework/template-kit'"],
    ['template-base', "import base from '@framework/template-base'"],
    ['file di template sendiri', "import Card from './components/Card'"],
  ])('mengizinkan import %s', async (_label, code) => {
    expect(await restrictedImportErrors(`${code}\nexport { }`, file)).toEqual([])
  })

  // Komponen .vue: import di <script setup lang="ts"> kena aturan yang sama.
  const vueFile = 'templates/magazine/src/components/ArticleCard.vue'
  const vue = (code: string) => `<script setup lang="ts">\n${code}\n</script>\n\n<template>\n  <div />\n</template>\n`

  it.each([
    ['core', "import { getFeed } from '@framework/core'"],
    ['db', "import { db } from '@framework/db'"],
    ['driver pg', "import pg from 'pg'"],
  ])('menolak import %s di komponen .vue', async (_label, code) => {
    expect(await restrictedImportErrors(vue(code), vueFile)).toHaveLength(1)
  })

  it('mengizinkan import template-kit di komponen .vue', async () => {
    const code = "import type { ArticleCardView } from '@framework/template-kit'"
    expect(await restrictedImportErrors(vue(code), vueFile)).toEqual([])
  })

  it('komponen .vue diparse tanpa error sintaks', async () => {
    const [result] = await eslint.lintText(vue("const title: string = 'Judul'\nconsole.log(title)"), { filePath: vueFile })
    expect(result?.messages.filter((m) => m.fatal)).toEqual([])
  })

  it('template-kit tidak boleh import core', async () => {
    const errors = await restrictedImportErrors(
      "import { getFeed } from '@framework/core'\nexport { }",
      'packages/template-kit/src/index.ts',
    )
    expect(errors).toHaveLength(1)
  })

  it('core boleh import db (aturan hanya berlaku untuk template)', async () => {
    const errors = await restrictedImportErrors(
      "import { db } from '@framework/db'\nexport { }",
      'packages/core/src/index.ts',
    )
    expect(errors).toEqual([])
  })
})

describe('aturan import kode app/ (Vue)', () => {
  const file = 'apps/web/app/plugins/site.server.ts'

  it.each([
    ['nilai dari core', "import { createRepositories } from '@framework/core'"],
    ['nilai dari db', "import { sql } from '@framework/db'"],
    ['driver pg', "import pg from 'pg'"],
  ])('menolak %s', async (_label, code) => {
    expect(await restrictedImportErrors(`${code}\nexport { }`, file)).toHaveLength(1)
  })

  it.each([
    ['tipe dari core', "import type { SiteInfo } from '@framework/core'"],
    ['subpath murni core/media', "import { toImageView } from '@framework/core/media'"],
    ['template-kit', "import { createTemplateRegistry } from '@framework/template-kit'"],
  ])('mengizinkan %s', async (_label, code) => {
    expect(await restrictedImportErrors(`${code}\nexport { }`, file)).toEqual([])
  })

  it('kode server/ boleh import core', async () => {
    expect(await restrictedImportErrors("import { createRepositories } from '@framework/core'\nexport { }", 'apps/web/server/utils/database.ts')).toEqual([])
  })
})
