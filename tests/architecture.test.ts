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
    .filter((m) => m.ruleId === 'no-restricted-imports')
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
