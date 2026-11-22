// Memastikan schema hasil `drizzle-kit pull` membaca constraint penting
// dengan benar: composite FK antar-site dan partial index publik.
import { getColumnTable, getTableName, is } from 'drizzle-orm'
import { getTableConfig, PgDialect, PgTable, type PgColumn } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import * as schema from './schema'

const tables = Object.values(schema as Record<string, unknown>).filter((v): v is PgTable => is(v, PgTable))
const dialect = new PgDialect()

const colNames = (cols: PgColumn[]) => cols.map((c) => c.name)
const hasSiteId = (t: PgTable) => getTableConfig(t).columns.some((c) => c.name === 'site_id')

function foreignKeys() {
  return tables.flatMap((table) =>
    getTableConfig(table).foreignKeys.map((fk) => {
      const ref = fk.reference()
      return {
        name: fk.getName(),
        table: getTableName(table),
        columns: colNames(ref.columns),
        foreignTable: ref.foreignTable,
        foreignColumns: colNames(ref.foreignColumns),
        onDelete: fk.onDelete,
      }
    }),
  )
}

function index(tableName: string, indexName: string) {
  const table = tables.find((t) => getTableName(t) === tableName)
  const idx = table && getTableConfig(table).indexes.find((i) => i.config.name === indexName)
  if (!idx) throw new Error(`index ${indexName} tidak ditemukan di ${tableName}`)
  return {
    unique: idx.config.unique,
    columns: idx.config.columns.map((c) => (c as PgColumn).name),
    where: idx.config.where ? dialect.sqlToQuery(idx.config.where).sql : undefined,
  }
}

describe('schema hasil drizzle-kit pull', () => {
  it('berisi 18 tabel (0001: 16, 0002: +2), tanpa schema_migrations', () => {
    const names = tables.map(getTableName)
    expect(names).toHaveLength(18)
    expect(names).not.toContain('schema_migrations')
  })

  it('setiap FK ke tabel milik site menyertakan site_id di kedua sisi', () => {
    // FK parent menu item memakai (menu_id, parent_id): satu menu sudah pasti satu site
    // karena menu_items -> menus juga composite FK lewat site_id.
    const exempt = new Set(['fk_menu_items_parent_same_menu'])
    const violations = foreignKeys()
      .filter((fk) => !exempt.has(fk.name))
      .filter((fk) => getTableName(fk.foreignTable) !== 'sites' && hasSiteId(fk.foreignTable))
      .filter((fk) => {
        const i = fk.foreignColumns.indexOf('site_id')
        const local = fk.columns[i]
        // sites.id berperan sebagai site_id untuk logo/favicon.
        return i === -1 || (local !== 'site_id' && !(fk.table === 'sites' && local === 'id'))
      })
      .map((fk) => fk.name)
    expect(violations).toEqual([])
  })

  it.each([
    ['fk_articles_category_same_site', ['site_id', 'category_id'], 'categories', ['site_id', 'id'], 'no action'],
    ['fk_articles_media_same_site', ['site_id', 'featured_media_id'], 'media', ['site_id', 'id'], 'set null'],
    ['fk_article_tags_tag_same_site', ['site_id', 'tag_id'], 'tags', ['site_id', 'id'], 'cascade'],
    ['fk_categories_parent_same_site', ['site_id', 'parent_id'], 'categories', ['site_id', 'id'], 'no action'],
    ['fk_authors_member', ['site_id', 'user_id'], 'site_members', ['site_id', 'user_id'], 'set null'],
    ['fk_sites_logo_same_site', ['id', 'logo_media_id'], 'media', ['site_id', 'id'], 'set null'],
  ])('%s terbaca sebagai composite FK', (name, columns, foreignTable, foreignColumns, onDelete) => {
    const fk = foreignKeys().find((f) => f.name === name)
    expect(fk).toMatchObject({ columns, foreignColumns, onDelete })
    expect(fk && getTableName(fk.foreignTable)).toBe(foreignTable)
  })

  it.each([
    ['articles', 'idx_articles_public_feed', ['site_id', 'published_at'], "(status = 'PUBLISHED'::text)"],
    ['articles', 'idx_articles_public_category', ['site_id', 'category_id', 'published_at'], "(status = 'PUBLISHED'::text)"],
    ['articles', 'idx_articles_public_featured', ['site_id', 'published_at'], "((status = 'PUBLISHED'::text) AND is_featured)"],
    ['site_domains', 'uq_site_domains_one_primary', ['site_id'], 'is_primary'],
    ['site_themes', 'uq_site_themes_one_active', ['site_id'], 'is_active'],
    ['authors', 'uq_authors_site_user', ['site_id', 'user_id'], '(user_id IS NOT NULL)'],
  ])('partial index %s.%s terbaca dengan WHERE', (table, name, columns, where) => {
    expect(index(table, name)).toMatchObject({ columns, where })
  })

  it('kolom tabel milik site memakai tabel yang benar', () => {
    expect(getTableName(getColumnTable(schema.articles.siteId))).toBe('articles')
  })
})
