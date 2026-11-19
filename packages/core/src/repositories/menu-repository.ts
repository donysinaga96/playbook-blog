import { and, articles, asc, categories, eq, inArray, menuItems, menus, pages, tags } from '@framework/db'
import { publiclyVisible } from './shared'
import type { RepositoryContext, SiteId, SiteScoped } from './types'

/**
 * Tujuan item menu yang sudah di-resolve. Repository sengaja tidak membuat
 * URL: pola route (mis. /p/{slug}, permalink artikel) milik lapisan view
 * model, supaya hanya ada satu tempat yang mengetahuinya.
 */
export type MenuTarget =
  | { type: 'CATEGORY'; slug: string; name: string }
  | { type: 'ARTICLE'; slug: string; title: string; categorySlug: string }
  | { type: 'PAGE'; slug: string; title: string }
  | { type: 'TAG'; slug: string; name: string }
  | { type: 'URL'; url: string }
  | { type: 'ROUTE'; path: string }

export interface MenuNode {
  id: string
  label: string
  openInNewTab: boolean
  target: MenuTarget
  children: MenuNode[]
}

export interface Menu {
  id: string
  location: string
  name: string
  items: MenuNode[]
}

/**
 * Repository menu. Item yang tidak aktif, atau yang tujuannya tidak tampil
 * publik (halaman/artikel belum terbit, kategori HIDDEN, tujuan sudah
 * terhapus), dibuang bersama seluruh turunannya, jadi template tidak pernah
 * menerima tautan mati.
 */
export function createMenuRepository(ctx: RepositoryContext) {
  const { db } = ctx

  return {
    /** Menu di lokasi tertentu ('header', 'footer', ...) sebagai pohon; null bila lokasi belum punya menu. */
    async getMenuTree(siteId: SiteId, location: string): Promise<Menu | null> {
      const [menu] = await db
        .select({ id: menus.id, location: menus.location, name: menus.name })
        .from(menus)
        .where(and(eq(menus.siteId, siteId), eq(menus.location, location)))
        .limit(1)
      if (!menu) return null

      const items = await db
        .select()
        .from(menuItems)
        .where(and(eq(menuItems.siteId, siteId), eq(menuItems.menuId, menu.id), eq(menuItems.isActive, true)))
        .orderBy(asc(menuItems.sortOrder), asc(menuItems.id))

      const idsOf = (pick: (i: (typeof items)[number]) => string | null) =>
        items.map(pick).filter((id): id is string => id !== null)
      const categoryIds = idsOf((i) => i.categoryId)
      const pageIds = idsOf((i) => i.pageId)
      const tagIds = idsOf((i) => i.tagId)
      const articleIds = idsOf((i) => i.articleId)

      const [categoryRows, pageRows, tagRows, articleRows] = await Promise.all([
        categoryIds.length
          ? db
              .select({ id: categories.id, slug: categories.slug, name: categories.name })
              .from(categories)
              .where(and(eq(categories.siteId, siteId), eq(categories.status, 'ACTIVE'), inArray(categories.id, categoryIds)))
          : [],
        pageIds.length
          ? db
              .select({ id: pages.id, slug: pages.slug, title: pages.title })
              .from(pages)
              .where(and(eq(pages.siteId, siteId), publiclyVisible(pages, ctx.now()), inArray(pages.id, pageIds)))
          : [],
        tagIds.length
          ? db
              .select({ id: tags.id, slug: tags.slug, name: tags.name })
              .from(tags)
              .where(and(eq(tags.siteId, siteId), inArray(tags.id, tagIds)))
          : [],
        articleIds.length
          ? db
              .select({ id: articles.id, slug: articles.slug, title: articles.title, categorySlug: categories.slug })
              .from(articles)
              .innerJoin(categories, and(eq(categories.siteId, articles.siteId), eq(categories.id, articles.categoryId)))
              .where(and(eq(articles.siteId, siteId), publiclyVisible(articles, ctx.now()), inArray(articles.id, articleIds)))
          : [],
      ])
      const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]))
      const cat = byId(categoryRows)
      const pg = byId(pageRows)
      const tg = byId(tagRows)
      const art = byId(articleRows)

      const resolve = (item: (typeof items)[number]): MenuTarget | null => {
        switch (item.itemType) {
          case 'CATEGORY': {
            const c = item.categoryId ? cat.get(item.categoryId) : undefined
            return c ? { type: 'CATEGORY', slug: c.slug, name: c.name } : null
          }
          case 'PAGE': {
            const p = item.pageId ? pg.get(item.pageId) : undefined
            return p ? { type: 'PAGE', slug: p.slug, title: p.title } : null
          }
          case 'TAG': {
            const t = item.tagId ? tg.get(item.tagId) : undefined
            return t ? { type: 'TAG', slug: t.slug, name: t.name } : null
          }
          case 'ARTICLE': {
            const a = item.articleId ? art.get(item.articleId) : undefined
            return a ? { type: 'ARTICLE', slug: a.slug, title: a.title, categorySlug: a.categorySlug } : null
          }
          case 'URL':
            return item.url ? { type: 'URL', url: item.url } : null
          case 'ROUTE':
            return item.url ? { type: 'ROUTE', path: item.url } : null
          default:
            return null
        }
      }

      // Telusuri dari akar: induk yang dibuang menyembunyikan seluruh turunannya.
      const childrenOf = new Map<string | null, typeof items>()
      for (const item of items) {
        const list = childrenOf.get(item.parentId) ?? []
        list.push(item)
        childrenOf.set(item.parentId, list)
      }
      const build = (parentId: string | null): MenuNode[] =>
        (childrenOf.get(parentId) ?? []).flatMap((item) => {
          const target = resolve(item)
          if (!target) return []
          return [{ id: item.id, label: item.label, openInNewTab: item.openInNewTab, target, children: build(item.id) }]
        })

      return { id: menu.id, location: menu.location, name: menu.name, items: build(null) }
    },
  } satisfies Record<string, SiteScoped>
}

export type MenuRepository = ReturnType<typeof createMenuRepository>
