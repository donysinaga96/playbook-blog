// Mengelola domain site tanpa SQL manual (M5 5.1b).
//
//   pnpm site:domain --site <kode>                          daftar domain
//   pnpm site:domain --site <kode> --add <domain> [--primary]
//   pnpm site:domain --site <kode> --primary-domain <domain>  jadikan primary
//   pnpm site:domain --site <kode> --remove <domain>          hapus alias
import { parseArgs } from 'node:util'
import { createSiteProvisioner, EditorError } from '@framework/core'
import { createDatabase, databaseUrlFromEnv } from '@framework/db'

const USAGE = `Pemakaian:
  pnpm site:domain --site <kode> [--add <domain> [--primary] | --primary-domain <domain> | --remove <domain>]`

function fail(message: string): never {
  console.error(`[site] ${message}`)
  process.exit(1)
}

const { values } = (() => {
  try {
    return parseArgs({
      options: {
        site: { type: 'string' },
        add: { type: 'string' },
        primary: { type: 'boolean', default: false },
        'primary-domain': { type: 'string' },
        remove: { type: 'string' },
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
if (!values.site) fail(`--site wajib\n${USAGE}`)
const actions = [values.add, values['primary-domain'], values.remove].filter(Boolean)
if (actions.length > 1) fail(`pilih satu: --add, --primary-domain, atau --remove\n${USAGE}`)

const db = createDatabase({ connectionString: databaseUrlFromEnv(), max: 1, applicationName: 'site-domain' })
const sites = createSiteProvisioner(db)
try {
  if (values.add) console.log(`[site] ${await sites.addDomain(values.site, values.add, values.primary)} ditambahkan${values.primary ? ' sebagai primary' : ''}`)
  else if (values['primary-domain']) console.log(`[site] ${await sites.setPrimaryDomain(values.site, values['primary-domain'])} kini primary`)
  else if (values.remove) {
    await sites.removeDomain(values.site, values.remove)
    console.log(`[site] ${values.remove} dihapus`)
  }
  for (const d of await sites.listDomains(values.site)) console.log(`  ${d.isPrimary ? '*' : ' '} ${d.domain} (${d.status})`)
} catch (error) {
  if (error instanceof EditorError) fail(error.issues.length ? error.issues.map((i) => `${i.field}: ${i.message}`).join('\n  ') : error.message)
  throw error
} finally {
  await db.$client.end()
}
