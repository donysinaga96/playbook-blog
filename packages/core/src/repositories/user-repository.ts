// Repository user admin (ADR-009).
//
// Tabel users adalah identitas GLOBAL (tanpa site_id), seperti resolver
// site: fungsi di sini tidak menerima siteId. Akses ke site diturunkan dari
// site_members (atau is_superadmin) oleh listSites; setiap operasi konten
// tetap memakai repository yang menerima siteId.
import { and, asc, eq, inArray, siteMembers, sites, sql, users } from '@framework/db'
import type { SiteMode } from '../site/mode'
import type { RepositoryContext } from './types'

export interface AdminUser {
  id: string
  email: string
  displayName: string
  isSuperadmin: boolean
}

export interface LoginCandidate extends AdminUser {
  /** Null = user tanpa password (login lewat provider lain) atau DISABLED: tidak bisa login. */
  passwordHash: string | null
}

export interface AdminSite {
  id: string
  code: string
  name: string
  /** Zona waktu site (IANA), untuk input tanggal terbit di admin. */
  timezone: string
  defaultLocale: string
  /** Role keanggotaan; superadmin tanpa keanggotaan = 'SUPERADMIN'. */
  role: 'OWNER' | 'EDITOR' | 'AUTHOR' | 'SUPERADMIN'
}

export interface CreateAdminInput {
  email: string
  displayName: string
  passwordHash: string
  isSuperadmin: boolean
  /** Kode site tempat user menjadi OWNER. */
  siteCodes: string[]
}

export class UserInputError extends Error {
  override name = 'UserInputError'
}

/** Email disimpan huruf kecil (CHECK users_email_normalized). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

const userColumns = {
  id: users.id,
  email: users.email,
  displayName: users.displayName,
  isSuperadmin: users.isSuperadmin,
}

export function createUserRepository(ctx: RepositoryContext) {
  const { db } = ctx

  return {
    /** User untuk login. User DISABLED dikembalikan tanpa hash agar tetap ditolak dengan pesan yang sama. */
    async findForLogin(email: string): Promise<LoginCandidate | null> {
      const [row] = await db
        .select({ ...userColumns, passwordHash: users.passwordHash, status: users.status })
        .from(users)
        .where(eq(users.email, normalizeEmail(email)))
        .limit(1)
      if (!row) return null
      const { status, passwordHash, ...user } = row
      return { ...user, passwordHash: status === 'ACTIVE' ? passwordHash : null }
    },

    /** User ACTIVE berdasarkan id (dipanggil setiap request admin); null bila tidak ada atau DISABLED. */
    async getActive(id: string): Promise<AdminUser | null> {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null
      const [row] = await db
        .select(userColumns)
        .from(users)
        .where(and(eq(users.id, id), eq(users.status, 'ACTIVE')))
        .limit(1)
      return row ?? null
    },

    async recordLogin(id: string): Promise<void> {
      await db.update(users).set({ lastLoginAt: sql`now()` }).where(eq(users.id, id))
    },

    /**
     * Site ACTIVE yang boleh dikelola user. Superadmin: semua site (role dari
     * keanggotaan bila ada). Mode single: hanya site SITE_CODE.
     */
    async listSites(user: AdminUser, mode: SiteMode): Promise<AdminSite[]> {
      const memberships = await db
        .select({ siteId: siteMembers.siteId, role: siteMembers.role })
        .from(siteMembers)
        .where(eq(siteMembers.userId, user.id))
      const roles = new Map(memberships.map((m) => [m.siteId, m.role as AdminSite['role']]))

      const conditions = [eq(sites.status, 'ACTIVE')]
      if (mode.mode === 'single') conditions.push(eq(sites.code, mode.siteCode))
      const rows = await db
        .select({ id: sites.id, code: sites.code, name: sites.name, timezone: sites.timezone, defaultLocale: sites.defaultLocale })
        .from(sites)
        .where(and(...conditions))
        .orderBy(asc(sites.name))

      return rows.flatMap((site) => {
        const role = roles.get(site.id) ?? (user.isSuperadmin ? 'SUPERADMIN' : null)
        return role ? [{ ...site, role }] : []
      })
    },

    /** Membuat admin + keanggotaan OWNER dalam satu transaksi (CLI admin:create). */
    async createAdmin(input: CreateAdminInput): Promise<AdminUser> {
      const email = normalizeEmail(input.email)
      return db.transaction(async (tx) => {
        const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
        if (existing) throw new UserInputError(`user ${email} sudah ada (pakai --reset-password untuk mengganti password)`)

        const siteRows = input.siteCodes.length
          ? await tx.select({ id: sites.id, code: sites.code }).from(sites).where(inArray(sites.code, input.siteCodes))
          : []
        const missing = input.siteCodes.filter((code) => !siteRows.some((s) => s.code === code))
        if (missing.length) throw new UserInputError(`site tidak ditemukan: ${missing.join(', ')}`)

        const [created] = await tx
          .insert(users)
          .values({ email, displayName: input.displayName.trim(), passwordHash: input.passwordHash, isSuperadmin: input.isSuperadmin })
          .returning(userColumns)
        if (!created) throw new Error('insert user tidak mengembalikan baris')
        if (siteRows.length) {
          await tx.insert(siteMembers).values(siteRows.map((s) => ({ siteId: s.id, userId: created.id, role: 'OWNER' })))
        }
        return created
      })
    },

    /** Ganti password user yang sudah ada; false bila email tidak ditemukan. */
    async setPassword(email: string, passwordHash: string): Promise<boolean> {
      const rows = await db
        .update(users)
        .set({ passwordHash, updatedAt: sql`now()` })
        .where(eq(users.email, normalizeEmail(email)))
        .returning({ id: users.id })
      return rows.length > 0
    },
  }
}

export type UserRepository = ReturnType<typeof createUserRepository>
