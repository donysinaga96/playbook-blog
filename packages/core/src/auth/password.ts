// Hash password admin (ADR-009): Argon2id dengan parameter bawaan
// @node-rs/argon2 (memori 19 MiB, 2 iterasi, paralelisme 1 = minimum OWASP).
import { hash, verify } from '@node-rs/argon2'

/** Algorithm.Argon2id; enum itu const enum, tidak bisa di-import dengan verbatimModuleSyntax. */
const ARGON2ID = 2

export const PASSWORD_MIN = 12
export const PASSWORD_MAX = 256

/** Pesan bila password tidak memenuhi aturan; null bila boleh dipakai. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `password minimal ${PASSWORD_MIN} karakter`
  if (password.length > PASSWORD_MAX) return `password maksimal ${PASSWORD_MAX} karakter`
  if (password.trim() !== password) return 'password tidak boleh diawali atau diakhiri spasi'
  return null
}

export async function hashPassword(password: string): Promise<string> {
  const problem = passwordProblem(password)
  if (problem) throw new Error(problem)
  return hash(password, { algorithm: ARGON2ID })
}

/** Hash dengan parameter sama, untuk verifikasi palsu saat user tidak ada (waktu respons mirip). */
let dummyHash: Promise<string> | undefined

function dummy(): Promise<string> {
  dummyHash ??= hash('password-palsu-untuk-waktu', { algorithm: ARGON2ID }).catch((error: unknown) => {
    dummyHash = undefined // jangan simpan kegagalan; coba lagi di percobaan berikutnya
    throw error
  })
  return dummyHash
}

/**
 * Cocokkan password dengan hash. `storedHash` null (user tidak ada atau tanpa
 * password) tetap menjalankan verifikasi terhadap hash palsu, lalu false.
 * Hash yang rusak dianggap tidak cocok, bukan error.
 */
export async function verifyPassword(storedHash: string | null, password: string): Promise<boolean> {
  if (password.length > PASSWORD_MAX) return false
  const target = storedHash ?? (await dummy())
  try {
    const ok = await verify(target, password)
    return ok && storedHash !== null
  } catch {
    return false
  }
}
