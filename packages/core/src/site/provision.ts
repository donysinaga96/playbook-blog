// Membuat site dan mengelola domainnya tanpa SQL manual (M5 5.1b, usulan
// M5-G). Dipakai CLI `pnpm site:create` dan `pnpm site:domain`.
//
// Site baru berisi:
//  - baris sites (kode, nama, locale, zona waktu, settings tervalidasi);
//  - domain primary (+ alias), dinormalisasi seperti resolver Host;
//  - theme aktif untuk template yang dipilih, dengan config kosong: token,
//    opsi, dan layout memakai default manifest sampai diatur di admin;
//  - menu kosong untuk setiap lokasi menu yang dikenal template terdaftar,
//    supaya berganti template di admin tidak butuh menu baru;
//  - penulis "Redaksi" (slug redaksi) untuk byline artikel, termasuk hasil AI;
//  - opsional: pemilik (user yang sudah ada) sebagai OWNER.
// Semua dalam satu transaksi. Kategori dibuat lewat admin.
import {
  and,
  asc,
  authors,
  count,
  desc,
  eq,
  menus,
  siteDomains,
  siteMembers,
  sites,
  siteThemes,
  users,
  type Database,
} from '@framework/db'
import { z } from 'zod'
import { editorErrorMap, invalid, notFound } from '../editor/errors'
import { normalizeHost } from '../repositories/site-repository'
import { siteSettingsSchema } from './settings'

const CODE = /^[a-z0-9]+(-[a-z0-9]+)*$/

const domainSchema = z.string().transform((raw, ctx) => {
  const host = normalizeHost(raw)
  // Port dan titik di akhir dibuang normalizeHost; protokol atau path tidak diterima.
  if (!host || /[/:]/.test(raw.replace(/:\d{1,5}$/, ''))) {
    ctx.addIssue({ code: 'custom', message: `domain tidak sah: ${raw}` })
    return z.NEVER
  }
  return host
})

const timezone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}, 'zona waktu IANA tidak dikenal, mis. Asia/Jakarta')

export const newSiteSchema = z.strictObject({
  code: z.string().max(50).regex(CODE, 'kode: huruf kecil, angka, tanda hubung'),
  name: z.string().trim().min(1).max(120),
  domain: domainSchema,
  aliases: z.array(domainSchema).max(20).default([]),
  template: z.string().min(1),
  locale: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/, 'locale mis. id-ID').default('id-ID'),
  timezone: timezone.default('Asia/Jakarta'),
  settings: siteSettingsSchema.default({ permalink: '/:category/:slug', seo: {}, social: {}, analytics: {} }),
  /** Email user yang sudah ada; menjadi OWNER site. */
  owner: z.email().optional(),
})
export type NewSiteInput = z.input<typeof newSiteSchema>

/** Template yang boleh dipakai: key -> versi manifest; plus semua lokasi menu yang dikenal. */
export interface TemplateCatalog {
  versionOf(key: string): string | null
  menuLocations: readonly string[]
}

export interface CreatedSite {
  id: string
  code: string
  domains: string[]
  template: string
}

function parse<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const result = schema.safeParse(raw, { error: editorErrorMap })
  if (result.success) return result.data
  throw invalid(result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })))
}

const MENU_NAMES: Record<string, string> = { header: 'Menu utama', footer: 'Menu bawah' }

export function createSiteProvisioner(db: Database) {
  async function siteByCode(code: string) {
    const [site] = await db.select({ id: sites.id, code: sites.code }).from(sites).where(eq(sites.code, code)).limit(1)
    if (!site) throw notFound(`Site ${code}`)
    return site
  }

  async function domainOwner(domain: string) {
    const [row] = await db.select({ code: sites.code }).from(siteDomains).innerJoin(sites, eq(sites.id, siteDomains.siteId)).where(eq(siteDomains.domain, domain)).limit(1)
    return row?.code ?? null
  }

  return {
    async createSite(raw: unknown, catalog: TemplateCatalog): Promise<CreatedSite> {
      const input = parse(newSiteSchema, raw)
      const version = catalog.versionOf(input.template)
      if (!version) throw invalid([{ field: 'template', message: `template "${input.template}" tidak terdaftar` }])
      const domains = [input.domain, ...input.aliases.filter((d) => d !== input.domain)]
      if (new Set(domains).size !== domains.length) throw invalid([{ field: 'aliases', message: 'domain dobel' }])

      return db.transaction(async (tx) => {
        const [taken] = await tx.select({ id: sites.id }).from(sites).where(eq(sites.code, input.code)).limit(1)
        if (taken) throw invalid([{ field: 'code', message: `kode "${input.code}" sudah dipakai` }])
        for (const domain of domains) {
          const [row] = await tx.select({ code: sites.code }).from(siteDomains).innerJoin(sites, eq(sites.id, siteDomains.siteId)).where(eq(siteDomains.domain, domain)).limit(1)
          if (row) throw invalid([{ field: 'domain', message: `domain ${domain} sudah dipakai site ${row.code}` }])
        }
        let ownerId: string | null = null
        if (input.owner) {
          const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.owner.toLowerCase())).limit(1)
          if (!user) throw invalid([{ field: 'owner', message: `user ${input.owner} belum ada; buat dulu dengan pnpm admin:create` }])
          ownerId = user.id
        }

        const [site] = await tx.insert(sites).values({
          code: input.code, name: input.name, defaultLocale: input.locale, timezone: input.timezone, settings: input.settings,
        }).returning({ id: sites.id })
        if (!site) throw new Error('insert site tidak mengembalikan baris')
        await tx.insert(siteDomains).values(domains.map((domain, i) => ({ siteId: site.id, domain, isPrimary: i === 0 })))
        await tx.insert(siteThemes).values({ siteId: site.id, templateKey: input.template, templateVersion: version, isActive: true })
        if (catalog.menuLocations.length) {
          await tx.insert(menus).values(catalog.menuLocations.map((location) => ({ siteId: site.id, location, name: MENU_NAMES[location] ?? location })))
        }
        await tx.insert(authors).values({ siteId: site.id, name: 'Redaksi', slug: 'redaksi' })
        if (ownerId) await tx.insert(siteMembers).values({ siteId: site.id, userId: ownerId, role: 'OWNER' })
        return { id: site.id, code: input.code, domains, template: input.template }
      })
    },

    /** Tambah domain ke site; primary = jadikan domain utama (yang lama menjadi alias). */
    async addDomain(code: string, rawDomain: string, primary = false): Promise<string> {
      const domain = parse(domainSchema, rawDomain)
      const site = await siteByCode(code)
      const owner = await domainOwner(domain)
      if (owner) throw invalid([{ field: 'domain', message: `domain ${domain} sudah dipakai site ${owner}` }])
      await db.transaction(async (tx) => {
        if (primary) await tx.update(siteDomains).set({ isPrimary: false }).where(eq(siteDomains.siteId, site.id))
        await tx.insert(siteDomains).values({ siteId: site.id, domain, isPrimary: primary })
      })
      return domain
    },

    /** Jadikan domain yang sudah ada milik site ini sebagai primary. */
    async setPrimaryDomain(code: string, rawDomain: string): Promise<string> {
      const domain = parse(domainSchema, rawDomain)
      const site = await siteByCode(code)
      await db.transaction(async (tx) => {
        const [row] = await tx.select({ id: siteDomains.id }).from(siteDomains).where(and(eq(siteDomains.siteId, site.id), eq(siteDomains.domain, domain))).limit(1)
        if (!row) throw notFound(`Domain ${domain} di site ${code}`)
        await tx.update(siteDomains).set({ isPrimary: false }).where(eq(siteDomains.siteId, site.id))
        await tx.update(siteDomains).set({ isPrimary: true }).where(eq(siteDomains.id, row.id))
      })
      return domain
    },

    /** Hapus alias. Domain primary tidak bisa dihapus (pindahkan primary dulu), domain terakhir juga tidak. */
    async removeDomain(code: string, rawDomain: string): Promise<void> {
      const domain = parse(domainSchema, rawDomain)
      const site = await siteByCode(code)
      await db.transaction(async (tx) => {
        const [row] = await tx.select({ id: siteDomains.id, isPrimary: siteDomains.isPrimary }).from(siteDomains)
          .where(and(eq(siteDomains.siteId, site.id), eq(siteDomains.domain, domain))).limit(1)
        if (!row) throw notFound(`Domain ${domain} di site ${code}`)
        if (row.isPrimary) throw invalid([{ field: 'domain', message: 'domain primary tidak bisa dihapus; jadikan domain lain primary dulu' }])
        const [total] = await tx.select({ n: count() }).from(siteDomains).where(eq(siteDomains.siteId, site.id))
        if ((total?.n ?? 0) <= 1) throw invalid([{ field: 'domain', message: 'domain terakhir site tidak bisa dihapus' }])
        await tx.delete(siteDomains).where(eq(siteDomains.id, row.id))
      })
    },

    /** Domain site, primary dulu. */
    async listDomains(code: string): Promise<{ domain: string; isPrimary: boolean; status: string }[]> {
      const site = await siteByCode(code)
      return db.select({ domain: siteDomains.domain, isPrimary: siteDomains.isPrimary, status: siteDomains.status }).from(siteDomains)
        .where(eq(siteDomains.siteId, site.id)).orderBy(desc(siteDomains.isPrimary), asc(siteDomains.domain))
    },
  }
}

export type SiteProvisioner = ReturnType<typeof createSiteProvisioner>
