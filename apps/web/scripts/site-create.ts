// Membuat site baru tanpa menyentuh database manual (M5 5.1b, usulan M5-G).
//
//   pnpm site:create --code dapur-sumatera --name "Dapur Sumatera" --template news \
//     --domain sumatera.localhost [--alias www.sumatera.localhost]... [--owner admin@local.test] \
//     [--tagline "..."] [--timezone Asia/Jakarta] [--locale id-ID] [--permalink /:category/:slug]
//
// Template divalidasi terhadap registry yang sama dengan server; menu dibuat
// untuk setiap lokasi menu yang dikenal template terdaftar. Kategori dibuat
// lewat admin.
import { parseArgs } from 'node:util'
import { createSiteProvisioner, EditorError } from '@framework/core'
import { createDatabase, databaseUrlFromEnv } from '@framework/db'
import { templateManifests } from '../server/utils/templates'

const USAGE = `Pemakaian:
  pnpm site:create --code <kode> --name <nama> --template <${templateManifests.templates.map((t) => t.key).join('|')}> --domain <domain>
                   [--alias <domain>]... [--owner <email>] [--tagline <teks>]
                   [--timezone <IANA>] [--locale <xx-XX>] [--permalink <pola>]`

function fail(message: string): never {
  console.error(`[site] ${message}`)
  process.exit(1)
}

const { values } = (() => {
  try {
    return parseArgs({
      options: {
        code: { type: 'string' },
        name: { type: 'string' },
        template: { type: 'string' },
        domain: { type: 'string' },
        alias: { type: 'string', multiple: true, default: [] },
        owner: { type: 'string' },
        tagline: { type: 'string' },
        timezone: { type: 'string' },
        locale: { type: 'string' },
        permalink: { type: 'string' },
        help: { type: 'boolean', default: false },
      },
      strict: true,
    })
  } catch (error) {
    return fail(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`)
  }
})()

if (values.help) {
  console.log(USAGE)
  process.exit(0)
}
if (!values.code || !values.name || !values.template || !values.domain) fail(`--code, --name, --template, dan --domain wajib\n${USAGE}`)

const menuLocations = [...new Set(templateManifests.templates.flatMap((t) => t.menuLocations))]
const db = createDatabase({ connectionString: databaseUrlFromEnv(), max: 1, applicationName: 'site-create' })
try {
  const site = await createSiteProvisioner(db).createSite(
    {
      code: values.code,
      name: values.name,
      template: values.template,
      domain: values.domain,
      aliases: values.alias,
      owner: values.owner,
      timezone: values.timezone,
      locale: values.locale,
      settings: {
        ...(values.tagline && { tagline: values.tagline }),
        ...(values.permalink && { permalink: values.permalink }),
      },
    },
    { versionOf: (key) => (templateManifests.has(key) ? templateManifests.get(key).version : null), menuLocations },
  )
  console.log(`[site] ${site.code} dibuat (template ${site.template}): ${site.domains.join(', ')}`)
  console.log('[site] berikutnya: buat kategori dan menu di admin; atur tema di menu Tema.')
} catch (error) {
  if (error instanceof EditorError) fail(error.issues.length ? error.issues.map((i) => `${i.field}: ${i.message}`).join('\n  ') : error.message)
  throw error
} finally {
  await db.$client.end()
}
