// Membuat admin pertama tanpa menyentuh database manual (ADR-009, gate M4).
//
//   pnpm admin:create --email admin@contoh.id --name "Nama" --superadmin
//   pnpm admin:create --email editor@contoh.id --name "Nama" --site kabar-tekno --site dapur-nusantara
//   pnpm admin:create --email admin@local.test --reset-password
//
// Password dibaca dari prompt tersembunyi (diketik dua kali) di terminal, atau
// dari env ADMIN_PASSWORD bila tanpa terminal (CI). Tidak pernah dari argumen:
// argumen terlihat di riwayat shell dan daftar proses.
import { parseArgs } from 'node:util'
import { createRepositories, hashPassword, passwordProblem, UserInputError } from '@framework/core'
import { createDatabase, databaseUrlFromEnv } from '@framework/db'

const USAGE = `Pemakaian:
  pnpm admin:create --email <email> --name <nama> [--superadmin] [--site <kode>]...
  pnpm admin:create --email <email> --reset-password
Password: prompt tersembunyi di terminal; tanpa terminal (CI): env ADMIN_PASSWORD.`

function fail(message: string): never {
  console.error(`[admin] ${message}`)
  process.exit(1)
}

const { values } = (() => {
  try {
    return parseArgs({
      options: {
        email: { type: 'string' },
        name: { type: 'string' },
        superadmin: { type: 'boolean', default: false },
        site: { type: 'string', multiple: true, default: [] },
        'reset-password': { type: 'boolean', default: false },
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
if (!values.email) fail(`--email wajib diisi\n${USAGE}`)
const reset = values['reset-password']
if (!reset && !values.name?.trim()) fail(`--name wajib diisi untuk user baru\n${USAGE}`)
if (!reset && !values.superadmin && values.site.length === 0) {
  fail('user baru harus --superadmin atau punya minimal satu --site; tanpa itu tidak ada yang bisa dikelola')
}

/** Sisa ketikan setelah Enter (mis. dua baris di-paste sekaligus), untuk prompt berikutnya. */
let pending = ''

/** Baca satu baris dari terminal tanpa menampilkan ketikan. */
function promptHidden(question: string): Promise<string> {
  const { stdin, stdout } = process
  stdout.write(question)
  const finish = (line: string, rest: string) => {
    pending = rest
    stdout.write('\n')
    return line
  }
  const newline = pending.search(/[\r\n]/)
  if (newline >= 0) return Promise.resolve(finish(pending.slice(0, newline), pending.slice(newline + 1).replace(/^\n/, '')))

  stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding('utf8')
  let input = pending
  pending = ''
  return new Promise((resolve) => {
    const onData = (chunk: string) => {
      for (let i = 0; i < chunk.length; i++) {
        const ch = chunk[i] as string
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          stdin.setRawMode(false)
          stdin.pause()
          stdin.off('data', onData)
          const rest = chunk.slice(i + 1)
          resolve(finish(input, ch === '\r' ? rest.replace(/^\n/, '') : rest))
          return
        }
        if (ch === '\u0003') {
          stdin.setRawMode(false)
          stdout.write('\n')
          process.exit(130)
        }
        if (ch === '\u007f' || ch === '\b') input = input.slice(0, -1)
        else input += ch
      }
    }
    stdin.on('data', onData)
  })
}

/**
 * Terminal: selalu prompt (ADMIN_PASSWORD di .env tidak dipakai diam-diam
 * untuk user baru). Tanpa terminal (CI): ADMIN_PASSWORD, dengan peringatan.
 */
async function readPassword(): Promise<string> {
  const fromEnv = process.env['ADMIN_PASSWORD']
  if (!process.stdin.isTTY) {
    if (!fromEnv) fail('stdin bukan terminal: isi password lewat env ADMIN_PASSWORD')
    console.warn('[admin] memakai password dari ADMIN_PASSWORD')
    return fromEnv
  }
  if (fromEnv) console.warn('[admin] ADMIN_PASSWORD diabaikan di terminal; ketik password')
  const first = await promptHidden('Password: ')
  const problem = passwordProblem(first)
  if (problem) fail(problem)
  if ((await promptHidden('Ulangi password: ')) !== first) fail('password tidak sama')
  return first
}

const password = await readPassword()
const problem = passwordProblem(password)
if (problem) fail(problem)

const db = createDatabase({ connectionString: databaseUrlFromEnv(), max: 1, applicationName: 'admin-create' })
try {
  const users = createRepositories(db).users
  const passwordHash = await hashPassword(password)
  if (reset) {
    if (!(await users.setPassword(values.email, passwordHash))) fail(`user ${values.email} tidak ditemukan`)
    console.log(`[admin] password ${values.email.toLowerCase()} diganti`)
  } else {
    const user = await users.createAdmin({
      email: values.email,
      displayName: values.name ?? '',
      passwordHash,
      isSuperadmin: values.superadmin,
      siteCodes: values.site,
    })
    const scope = [user.isSuperadmin ? 'superadmin' : null, values.site.length ? `OWNER di ${values.site.join(', ')}` : null].filter(Boolean).join('; ')
    console.log(`[admin] user ${user.email} dibuat (${scope})`)
  }
} catch (error) {
  if (error instanceof UserInputError) fail(error.message)
  throw error
} finally {
  await db.$client.end()
}
